import { lib, task } from "mod.ts";

lib(
  "elm-live-reload",
  "https://raw.githubusercontent.com/jinjor/deno-playground/master/elm-live-reload/elm-live-reload.ts",
  ["net", "run"]
);
task("start", "elm-live-reload src/Main.elm src/index.html");
