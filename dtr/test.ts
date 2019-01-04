import { lib, task, github, x } from "mod.ts";

lib(
  "elm-live-reload",
  github("jinjor/deno-playground@master", "elm-live-reload/elm-live-reload.ts"),
  ["net", "run"]
);
task("start", "elm-live-reload src/Main.elm src/index.html");
