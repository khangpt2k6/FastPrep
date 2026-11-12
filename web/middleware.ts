// Vercel runs this before every request to the deployed page. The page signs in by itself as the agent's account, so it
// must not open for just anyone who finds the address: it opens for a browser that came once through the private link
// (`/?key=<ACCESS_KEY>`), which leaves a cookie behind. With no ACCESS_KEY set, the page is open to everyone.
import { next } from '@vercel/functions/middleware';

export const config = { matcher: '/:path*' };

const COOKIE = 'aa_key';
// The longest a browser keeps a cookie (400 days).
const KEEP_SECONDS = 400 * 24 * 60 * 60;

const LOCKED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private</title><style>html,body{height:100%;margin:0;background:#07090c;color:#8b95a1;font:15px system-ui,sans-serif}
body{display:grid;place-items:center}</style></head><body>Private</body></html>`;

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request: Request): Response {
  const key = process.env.ACCESS_KEY ?? '';
  if (!key) return next();

  const cookies = (request.headers.get('cookie') ?? '').split(/;\s*/);
  if (cookies.some((pair) => pair.startsWith(`${COOKIE}=`) && same(pair.slice(COOKIE.length + 1), key))) return next();

  const url = new URL(request.url);
  const given = url.searchParams.get('key');
  if (given && same(given, key)) {
    url.searchParams.delete('key');
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + url.search,
        'Set-Cookie': `${COOKIE}=${key}; Path=/; Max-Age=${KEEP_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(LOCKED, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
