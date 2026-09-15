#!/usr/bin/env node
// ASK THE RUNNING GAME A QUESTION — the one in the Electron window, the one
// actually being played, not a second copy in a browser tab.
//
// WHY THIS EXISTS. `npm run dev` puts the game in its shell, and the shell
// is where a slow wave happens: the player's save, the player's board, the
// player's run. A measurement taken anywhere else is a measurement of a
// reconstruction, and reconstructions have already been wrong here — a
// benchmark board at the same body count cost half what the real one did.
// So this talks to the real window instead of building another guess.
//
// HOW. desktop/src/main.ts opens Chromium's debugging port on an unpackaged
// shell (loopback only, never in a packaged build). That is the same channel
// devtools speaks; this sends one Runtime.evaluate down it and prints what
// comes back, so anything typeable into the console is scriptable from here.
//
//   node scripts/probe.mjs "__animechs.stats()"
//   node scripts/probe.mjs --file probe-body.js
//   node scripts/probe.mjs "__animechs.profile(true)" --wait 20 --then "__animechs.profileRead()"
//
// ARM, PLAY, READ is the shape a measurement needs, and the two ends are
// different expressions — so `--then` is a SECOND expression, run after
// `--wait` seconds, and its answer is what gets printed. The game runs
// normally in between; nothing here holds it.
import fs from "node:fs";
import process from "node:process";

const PORT = process.env.ANIMECHS_DEBUG_PORT ?? "9222";

/** the game's page among the shell's targets (devtools and workers are targets too) */
async function gameTarget() {
  let list;
  try {
    list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  } catch {
    throw new Error(
      `nothing is listening on ${PORT}. Start the game with \`npm run dev\` — the port ` +
        `is opened by the shell, and only when it is not packaged.`,
    );
  }
  const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!pages.length) throw new Error("the shell is up but has no page open yet — give it a moment");
  // the game is the one that is not devtools
  return pages.find((t) => !t.url.startsWith("devtools://")) ?? pages[0];
}

/** one Runtime.evaluate over the debugging socket, awaited and unwrapped */
function evaluate(ws, id, expression) {
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.removeEventListener("message", onMessage);
      if (msg.error) return reject(new Error(msg.error.message));
      const r = msg.result;
      if (r.exceptionDetails)
        return reject(new Error(r.exceptionDetails.exception?.description ?? "threw"));
      resolve(r.result.value);
    };
    ws.addEventListener("message", onMessage);
    ws.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        // returnByValue so an object comes back as JSON rather than a handle,
        // and awaitPromise so `await` in the expression works as it does in
        // the console
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
}

const argv = process.argv.slice(2);
const take = (flag) => {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const file = take("--file");
const wait = Number(take("--wait") ?? 0);
const then = take("--then");
const expression = file ? fs.readFileSync(file, "utf8") : argv.join(" ");
if (!expression.trim()) {
  console.error(
    'usage: node scripts/probe.mjs [--file f.js] "<expression>" [--wait N --then "<expression>"]',
  );
  process.exit(2);
}

// a stack trace here would be about this file, and every failure this can
// have is about the game not being up — so say that and stop
const target = await gameTarget().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, no) => {
  ws.addEventListener("open", ok, { once: true });
  ws.addEventListener("error", () => no(new Error("could not open the debugging socket")), {
    once: true,
  });
});

let out = await evaluate(ws, 1, expression);
if (then) {
  // the game plays on; this side is only holding a socket open
  if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));
  out = await evaluate(ws, 2, then);
}
ws.close();
console.log(typeof out === "string" ? out : JSON.stringify(out, null, 1));
