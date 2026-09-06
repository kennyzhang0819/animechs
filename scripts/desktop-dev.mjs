// `npm run desktop:dev`: the Next dev server and the Electron shell, one
// command, both torn down together. The shell is pointed at the server
// (--dev-url, see desktop/src/main.ts) and keeps retrying until Next has
// compiled, so the order they come up in does not matter.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const port = process.env.PORT ?? "3000";

const next = spawn(npm, ["run", "dev", "--", "--port", port], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
const shell = spawn(npm, ["run", "dev", "--", `--dev-url=http://localhost:${port}`], {
  cwd: path.join(root, "desktop"),
  stdio: "inherit",
  shell: process.platform === "win32",
});

let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const p of [next, shell]) if (p.exitCode === null) p.kill();
  process.exit(code);
};
shell.on("exit", (code) => stop(code ?? 0)); // closing the window ends the session
next.on("exit", (code) => stop(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => stop(0));
