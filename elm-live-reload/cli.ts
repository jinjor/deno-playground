import { args, run, exit } from "deno";
import { flags } from "./package.ts";
import { main } from "./index.ts";

const parsedArgs = flags.parse(args);
const mainFile = parsedArgs._[1];
const indexHtml = parsedArgs._[2];
const port = parsedArgs.p || parsedArgs.port || 3000;
const help = parsedArgs.h || parsedArgs.help;
const distDir = "./elm-stuff/elm-live-reload";
const watchDir = "./src";
if (help) {
  showUsage();
  exit(0);
}
if (!mainFile || !indexHtml) {
  showUsage();
  exit(1);
}
function showUsage() {
  console.log();
  console.log(
    `Usage:
    deno path/to/elm-live-reload.ts src/Main.elm src/index.html --allow-net --allow-run`
  );
  console.log();
}
main(mainFile, indexHtml, distDir, watchDir, port);
