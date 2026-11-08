/**
 * Cloudflare Worker in front of the platform container.
 * - Every request is forwarded to ONE container instance ("main") running the Node API + web app.
 * - Secrets live in the Worker (wrangler secret put …) and are passed to the container at start.
 * - A Cron Trigger wakes the container periodically to run scheduled jobs (notifications, expiring attempts).
 */
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  APP: DurableObjectNamespace<ShifraApp>;
  // secrets
  DATABASE_URL: string;
  JWT_SECRET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  JOBS_TOKEN: string;
  // vars (wrangler.jsonc)
  PUBLIC_URL: string;
  S3_ENDPOINT: string;
  S3_BUCKET: string;
  MAX_UPLOAD_MB: string;
}

export class ShifraApp extends Container<Env> {
  defaultPort = 4000;
  sleepAfter = '20m';

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: 'production',
      PORT: '4000',
      DATABASE_URL: env.DATABASE_URL,
      JWT_SECRET: env.JWT_SECRET,
      PUBLIC_URL: env.PUBLIC_URL,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_BUCKET: env.S3_BUCKET,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
      JOBS_TOKEN: env.JOBS_TOKEN,
      MAX_UPLOAD_MB: env.MAX_UPLOAD_MB,
      STORAGE_DIR: '/tmp/storage',
    };
  }

  override onError(error: unknown) {
    console.error('container error', error);
    throw error;
  }
}

const app = (env: Env) => getContainer(env.APP, 'main');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // never expose the internal jobs endpoint publicly
    if (url.pathname.startsWith('/api/internal/')) return new Response('Not found', { status: 404 });
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
    headers.set('x-forwarded-proto', 'https');
    return app(env).fetch(new Request(request, { headers }));
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      app(env).fetch(new Request('http://container/api/internal/run-jobs', {
        method: 'POST',
        headers: { 'x-jobs-token': env.JOBS_TOKEN, 'X-Requested-With': 'shifra' },
      })),
    );
  },
};
