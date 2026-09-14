// Lets `node --experimental-transform-types --import ./scripts/ts-hooks.mjs`
// run a script that imports the game's TypeScript directly: the game's
// imports are extensionless (the bundler resolves them), and node's ESM
// loader wants the `.ts` on them. This resolve hook adds it when a
// relative specifier has no extension and the `.ts` file exists.
import { register } from "node:module";
// the URL's own href, not pathToFileURL(pathname): on Windows that pathname
// is "/C:/..." and pathToFileURL glues the drive on twice
register(new URL("./ts-resolve.mjs", import.meta.url).href);
