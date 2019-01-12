import { task } from "https://deno.land/x/task_runner/mod.ts";

task("test", "deno test.ts");
task("dev", "$test").watch(".", { test: ".ts$" });
