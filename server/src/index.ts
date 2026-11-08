/**
 * Vercel entry (zero-config Express). Loads the real app from ./main.js lazily so that, if startup
 * fails on the host, the reason is shown on the page instead of a generic FUNCTION_INVOCATION_FAILED.
 * Locally / in Docker the server is started with `src/main.ts`.
 */
import express from 'express';

type Handler = (req: express.Request, res: express.Response, next: express.NextFunction) => void;
let loaded: Promise<Handler> | null = null;
let failure: { message: string; code?: string } | null = null;

function load() {
  loaded ??= import('./main.js')
    .then((m) => m.default as unknown as Handler)
    .catch((e: any) => {
      console.error('[startup] failed to load the app:', e);
      failure = { message: String(e?.message ?? e).slice(0, 600), code: e?.code };
      loaded = null; // retry on next request
      throw e;
    });
  return loaded;
}

const app = express();
app.use((req, res, next) => {
  load().then((real) => real(req, res, next)).catch(() => {
    res.status(500).type('html').send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تعذّر تشغيل المنصة</title><body style="font-family:system-ui;max-width:720px;margin:8vh auto;padding:0 20px;line-height:1.8;color:#1e1b4b">
<h1>تعذّر تشغيل المنصة</h1><p>أرسلي هذه الرسالة لمن يدير المنصة:</p>
<pre dir="ltr" style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px">${(failure?.code ? failure.code + ': ' : '') + (failure?.message ?? 'unknown error').replace(/[<>&]/g, '')}</pre></body></html>`);
  });
});

export default app;
