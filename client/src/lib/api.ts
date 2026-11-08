export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];
  constructor(status: number, message: string, issues?: { path: string; message: string }[]) { super(message); this.status = status; this.issues = issues; }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'shifra' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch('/api' + url, { method, headers, body: payload, credentials: 'same-origin' });
  const ct = r.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await r.json() : null;
  if (!r.ok) {
    const issues = data?.issues as { path: string; message: string }[] | undefined;
    const msg = issues?.length ? issues.map((i) => i.message).join(' — ') : data?.error ?? 'تعذّر الاتصال بالخادم';
    if (r.status === 401 && !url.startsWith('/auth')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(r.status, msg, issues);
  }
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => request<T>('GET', u),
  post: <T = any>(u: string, b: unknown = {}) => request<T>('POST', u, b),
  put: <T = any>(u: string, b: unknown) => request<T>('PUT', u, b),
  patch: <T = any>(u: string, b: unknown) => request<T>('PATCH', u, b),
  del: <T = any>(u: string) => request<T>('DELETE', u),
  upload: <T = any>(u: string, file: File) => { const f = new FormData(); f.append('file', file); return request<T>('POST', u, f); },
};

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, unknown>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

/** Triggers a file download from an authenticated GET endpoint. */
export function download(url: string) {
  const a = document.createElement('a');
  a.href = '/api' + url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export const fileUrl = (id: string, dl = false) => `/api/files/${id}${dl ? '?download=1' : ''}`;
