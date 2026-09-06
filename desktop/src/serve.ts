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

/** serve the export at app://game/ — after app.whenReady */
export function serveBundle(root: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("not found", { status: 404 });
    const file = resolveFile(root, url.pathname);
    if (!file) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}
