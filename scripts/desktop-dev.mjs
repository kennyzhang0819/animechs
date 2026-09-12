// `npm run dev`: a PRODUCTION build of the game, served by `next start`,
// inside the Electron shell — one command, both torn down together.
// `npm run dev:web` (--no-shell) is the same server without the shell.
//
// WHY A PRODUCTION BUILD IS THE DEVELOPMENT LOOP. The game is a real-time
// simulation drawn at sixty frames a second, and Next's dev mode — React
// reconciling in development, no minification, a file watcher and a
// hot-reload socket on the same main thread the frame runs on — made the
// thing being played feel nothing like the thing being shipped. Judging
// performance on it was misleading every time. So the loop builds what
// ships and runs that: a code change is a rebuild, thirty-odd seconds with
// the cache warm, rather than a hot reload. `npm run dev:hot` is the old
// loop for the times that trade is the wrong one.
//
// The admin editors and their API routes come along: NEXT_PUBLIC_ADMIN=1
// at build time is what game/env.ts ADMIN_ENABLED reads. The static
// export for the shell and Steam (build-static.sh) never sets it, so the
// shipped game still has no way in.
//
// Each port builds into its own directory (NEXT_DIST_DIR, next.config.ts):
// several of these run on one checkout at once — parallel sessions — and
// two builds into one .next would corrupt each other.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
const npx = win ? "npx.cmd" : "npx";
const port = process.env.PORT ?? "3000";
const desktop = path.join(root, "desktop");
const withShell = !process.argv.includes("--no-shell");

// the build and the server must agree on all three, so they share one env
const env = {
  ...process.env,
  NEXT_PUBLIC_ADMIN: "1",
  NEXT_DIST_DIR: `.next-${port}`,
  NODE_ENV: "production",
};

const install = (cwd, label) => {
  console.log(`${label}: installing dependencies (first run)`);
  const r = spawnSync(npm, ["ci"], { cwd, stdio: "inherit", shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// npm puts the `next` command in node_modules/.bin; without it the build
// dies with "'next' is not recognized". A fresh clone, or a tree whose
// .bin was lost, gets a full install here instead.
if (!fs.existsSync(path.join(root, "node_modules", ".bin", win ? "next.cmd" : "next"))) {
  install(root, "node_modules/");
}

// The shell is its own npm package, and Electron fetches its binary in a
// postinstall there (desktop/package.json). A fresh clone has neither, so
// install once here rather than fail in tsc with "Cannot find module
// 'electron'".
if (withShell && !fs.existsSync(path.join(desktop, "node_modules", "electron", "dist"))) {
  install(desktop, "desktop/");
}

// THE BUILD, to completion, before anything is started: a server pointed
// at a half-written build directory serves a broken page, and the shell
// would show it
console.log(`building (production, admin tools on) -> ${env.NEXT_DIST_DIR}`);
const build = spawnSync(npx, ["next", "build"], { cwd: root, stdio: "inherit", shell: win, env });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(npx, ["next", "start", "--port", port], {
  cwd: root,
  stdio: "inherit",
  shell: win,
  env,
});
const shell = withShell
  ? spawn(npm, ["run", "dev", "--", `--dev-url=http://localhost:${port}`], {
      cwd: desktop,
      stdio: "inherit",
      shell: win,
    })
  : null;
if (!withShell) console.log(`\n  open http://localhost:${port}\n`);

// On Windows the spawn above is a cmd.exe wrapper: killing it leaves npm,
// Next and Electron running as orphans, so take the whole tree down.
const kill = (p) => {
  if (!p || p.exitCode !== null) return;
  if (win) spawnSync("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore" });
  else p.kill();
};

let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const p of [server, shell]) kill(p);
  process.exit(code);
};
if (shell) shell.on("exit", (code) => stop(code ?? 0)); // closing the window ends the session
server.on("exit", (code) => stop(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0));
