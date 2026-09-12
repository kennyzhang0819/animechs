// `npm run dev`: the Next dev server and the Electron shell, one
// command, both torn down together. The shell is pointed at the server
// (--dev-url, see desktop/src/main.ts) and keeps retrying until Next has
// compiled, so the order they come up in does not matter.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
const port = process.env.PORT ?? "3000";
const desktop = path.join(root, "desktop");

const install = (cwd, label) => {
  console.log(`${label}: installing dependencies (first run)`);
  const r = spawnSync(npm, ["ci"], { cwd, stdio: "inherit", shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// npm puts the `next` command in node_modules/.bin; without it `npm run
// dev:web` dies with "'next' is not recognized" while the shell sits
// retrying a server that will never come up. A fresh clone, or a tree
// whose .bin was lost, gets a full install here instead.
if (!fs.existsSync(path.join(root, "node_modules", ".bin", win ? "next.cmd" : "next"))) {
  install(root, "node_modules/");
}

// The shell is its own npm package, and Electron fetches its binary in a
// postinstall there (desktop/package.json). A fresh clone has neither, so
// install once here rather than fail in tsc with "Cannot find module
// 'electron'".
if (!fs.existsSync(path.join(desktop, "node_modules", "electron", "dist"))) {
  install(desktop, "desktop/");
}

const next = spawn(npm, ["run", "dev:web", "--", "--port", port], {
  cwd: root,
  stdio: "inherit",
  shell: win,
});
const shell = spawn(npm, ["run", "dev", "--", `--dev-url=http://localhost:${port}`], {
  cwd: desktop,
  stdio: "inherit",
  shell: win,
});

// On Windows the spawn above is a cmd.exe wrapper: killing it leaves npm,
// Next and Electron running as orphans, so take the whole tree down.
const kill = (p) => {
  if (p.exitCode !== null) return;
  if (win) spawnSync("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore" });
  else p.kill();
};

let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const p of [next, shell]) kill(p);
  process.exit(code);
};
shell.on("exit", (code) => stop(code ?? 0)); // closing the window ends the session
next.on("exit", (code) => stop(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0));
