import { task } from "https://deno.land/x/task_runner/mod.ts";

task("dev", "deno test.ts").watch(".", { test: ".ts$" });
