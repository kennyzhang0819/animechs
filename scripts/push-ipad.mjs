#!/usr/bin/env node
/**
 * One command from a source edit to the iPad: static export, a local
 * static host, and the Tailscale HTTPS name pointed at it.
 *
 * The HTTPS is not a nicety. A service worker is secure-context only, so
 * a LAN address caches nothing and the offline build is found out on a
 * train (docs/offline.md). The tailnet name carries a real certificate.
 *
 * The server here replaces `npx serve` because it sends COOP/COEP itself,
 * so the first load is already cross-origin isolated and the sim keeps
 * its thread without OfflineReady's reload — and because it starts with
 * no network, which `npx serve` does not.
 *
 *   node scripts/push-ipad.mjs                build, serve, print the URL
 *   node scripts/push-ipad.mjs --watch        + rebuild on every source edit
 *   node scripts/push-ipad.mjs --no-build     serve out/ as it stands
 *   node scripts/push-ipad.mjs --no-admin     build what ships, tools compiled out
 *   node scripts/push-ipad.mjs --port 3120
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "out");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const PORT = Number(val("--port", "3120"));
const WATCH = has("--watch") || has("-w");
const BUILD = !has("--no-build");
const ADMIN = !has("--no-admin");

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const log = (...a) => console.log(dim(new Date().toTimeString().slice(0, 8)), ...a);

function build() {
  const t = Date.now();
  log(`building${ADMIN ? " (admin tools in)" : ""}...`);
  const r = spawnSync("npm", ["run", "build:static"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    // A TABLET TEST BUILD IS NOT A SHIPPED BUILD. The bundle Steam gets
    // comes from build:static on its own and never sets this, so the
    // tools stay compiled out there (game/env.ts); what goes over the
    // tailnet to your own iPad carries them, or the console's `admin`
    // opens the refusal screen. --no-admin builds what ships instead.
    env: ADMIN ? { ...process.env, NEXT_PUBLIC_ADMIN: "1" } : process.env,
  });
  if (r.status !== 0) {
    log(red("build FAILED - serving the previous bundle"));
    return false;
  }
  log(`built in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  return true;
}

function tailscaleBin() {
  const candidates =
    process.platform === "win32"
      ? ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"]
      : ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/usr/bin/tailscale"];
  for (const c of candidates) if (spawnSync(c, ["version"], { encoding: "utf8" }).status === 0) return c;
  return null;
}

function tailscaleUrl(ts) {
  const r = spawnSync(ts, ["status", "--json"], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) return null;
  try {
    return `https://${JSON.parse(r.stdout).Self.DNSName.replace(/\.$/, "")}`;
  } catch {
    return null;
  }
}

// Point the tailnet name's root at our port unless it already is. Only the
// `/` mount is touched; anything else being served stays as it was.
function ensureServe(ts) {
  const target = `http://127.0.0.1:${PORT}`;
  const status = spawnSync(ts, ["serve", "status"], { encoding: "utf8" }).stdout ?? "";
  if (status.includes(target)) return { ok: true, changed: false };
  const r = spawnSync(ts, ["serve", "--bg", "--https=443", target], { encoding: "utf8" });
  if (r.status !== 0) return { ok: false, why: (r.stderr || r.stdout || "").trim().split("\n")[0] };
  return { ok: true, changed: true };
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

// A path inside out/, or null. Mirrors desktop/src/serve.ts: an
// extensionless path is Next's <name>.html.
function resolveFile(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const abs = resolve(OUT, "." + (p.startsWith("/") ? p : "/" + p));
  if (abs !== OUT && !abs.startsWith(OUT + sep)) return null;
  for (const c of [abs, abs + ".html", join(abs, "index.html")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

const server = createServer((req, res) => {
  const hit = resolveFile(req.url ?? "/");
  const file = hit ?? join(OUT, "404.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const rel = "/" + relative(OUT, file).split(sep).join("/");
  res.writeHead(hit ? 200 : 404, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Content-Length": statSync(file).size,
    // COOP/COEP is what buys the sim its own thread (game/shared.ts); CORP
    // or the page could not load its own sprites under require-corp
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    // the worker and the shell must never be stale, or a rebuilt bundle is
    // invisible to a tablet that already holds the old one
    "Cache-Control": rel === "/sw.js" || rel.endsWith(".html") ? "no-store" : "no-cache",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

// public/foundry and public/icon-*.png are written BY the build
// (sync-foundry-art.mjs, gen-icons.mjs) — watching them rebuilds forever
const WATCHED = ["game", "components", "app", "public", "docs/turret-concepts", "next.config.ts"];
const IGNORE = /(^|[\\/])(foundry[\\/]|icon-\d+\.png$|apple-touch-icon\.png$|\.DS_Store$)|~$/;

function startWatch() {
  let timer = null;
  let running = false;
  let queued = false;
  const fire = () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    build();
    running = false;
    log(`serving out/ — relaunch on the iPad to take it`);
    if (queued) {
      queued = false;
      fire();
    }
  };
  for (const d of WATCHED) {
    const p = join(ROOT, d);
    if (!existsSync(p)) continue;
    watch(p, { recursive: true }, (_e, name) => {
      if (name && IGNORE.test(name)) return;
      clearTimeout(timer);
      timer = setTimeout(fire, 400);
    });
  }
  log(`watching ${WATCHED.join(", ")}`);
}

if (BUILD) build();
if (!existsSync(join(OUT, "index.html"))) {
  console.error(red("no out/index.html — build first, or drop --no-build"));
  process.exit(1);
}
if (!existsSync(join(OUT, "sw.js"))) log(red("no out/sw.js — the iPad will not cache for offline"));

server.listen(PORT, "127.0.0.1", () => {
  log(`http://127.0.0.1:${PORT} -> out/`);
  const ts = tailscaleBin();
  if (!ts) {
    log(red("tailscale not found — an iPad needs the HTTPS name, see docs/offline.md"));
  } else {
    const s = ensureServe(ts);
    if (!s.ok) log(red(`tailscale serve failed: ${s.why}`));
    else {
      if (s.changed) log(`tailscale serve -> 127.0.0.1:${PORT}`);
      console.log(`\n  ${bold("iPad:")}  ${cyan(tailscaleUrl(ts) ?? "https://<machine>.ts.net")}\n`);
      console.log(dim("  First time: open it in Safari, Share -> Add to Home Screen, and wait for"));
      console.log(dim('  "offline ready" bottom-left. After that a relaunch takes the new build.\n'));
    }
  }
  if (WATCH) startWatch();
});

const bye = () => {
  server.close();
  process.exit(0);
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
