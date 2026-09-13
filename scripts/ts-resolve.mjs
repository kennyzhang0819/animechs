// A resolve hook for `node --experimental-strip-types`: the game's modules
// import each other without extensions ("./constants"), which the
// bundler accepts and node does not. This tries "<spec>.ts" for a
// relative import that names no file, so a script can load a game module
// straight from source:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs <script>
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL(new URL("./ts-resolve-hook.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
