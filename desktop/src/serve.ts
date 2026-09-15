import { net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * THE GAME'S ORIGIN INSIDE THE SHELL. The static export fetches its
 * documents by absolute path — /levels/1.json, /maps/…, /_next/static/… —
 * so it cannot be loaded off file://; it needs a scheme with a root. This
 * registers app:// as a standard scheme (a host, relative URLs, fetch,
 * streams) and serves the export's directory at app://game/.
 */
export const APP_SCHEME = "app";
export const APP_HOST = "game";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** must run before app.whenReady — Chromium reads the list at startup */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Map a request path onto a file in the export, Next-style: `/` is
 * index.html, `/admin` is admin.html or admin/index.html, anything else
 * is itself. Never a file outside the root, whatever the path says.
 */
export function resolveFile(root: string, urlPath: string): string | null {
  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  const base = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (base !== rootAbs && !base.startsWith(rootAbs + path.sep)) return null;
  const candidates =
    base === rootAbs
      ? [path.join(base, "index.html")]
      : [base, `${base}.html`, path.join(base, "index.html")];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      // not this one
    }
  }
  return null;
}

/**
 * What a path with nothing behind it gets: the export's own 404 document
 * (app/not-found.tsx — the game's fault screen), so a bad path inside the
 * shell reads as the game and not as a browser's plain-text miss. If the
 * export has no such page the miss stays a bare 404.
 */
function missing(root: string): Response | Promise<Response> {
  const page = path.join(root, "404.html");
  try {
    if (fs.statSync(page).isFile()) {
      return net
        .fetch(pathToFileURL(page).href)
        .then((r) => new Response(r.body, { status: 404, headers: r.headers }));
    }
  } catch {
    // no 404 document in this export
  }
  return new Response("not found", { status: 404 });
}

/**
 * CROSS-ORIGIN ISOLATION, which is what buys the game a SharedArrayBuffer
 * — and the sim its own thread. The sim steps on a worker and the renderer
 * reads the world off memory both threads hold (game/shared.ts); a browser
 * only hands that memory to a page that is cross-origin isolated, and a
 * page is only that if the RESPONSE says so. The dev server sets these in
 * next.config.ts; here the shell is the server, so it sets them itself.
 *
 * Without them the game still runs, single-threaded, exactly as it did —
 * game/shared.ts falls back — which is precisely the failure that would
 * never be noticed: the shipped build quietly slower than the one being
 * developed. Every response gets both, the 404 document included.
 */
const ISOLATION: [string, string][] = [
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Embedder-Policy", "require-corp"],
];

function isolated(r: Response, status = r.status): Response {
  const headers = new Headers(r.headers);
  for (const [k, v] of ISOLATION) headers.set(k, v);
  return new Response(r.body, { status, headers });
}

/** serve the export at app://game/ — after app.whenReady */
export function serveBundle(root: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return isolated(await missing(root));
    const file = resolveFile(root, url.pathname);
    if (!file) return isolated(await missing(root));
    return isolated(await net.fetch(pathToFileURL(file).href));
  });
}
