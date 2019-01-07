import { TaskRunner } from "runner.ts";
import { test, assert, assertEqual } from "https://deno.land/x/testing/mod.ts";

test(async function basics() {
  const runner = new TaskRunner();
  runner.task("hello", "echo hello");
  runner.task("test", "$hello alice", "$hello bob");
  await runner.run("test");
});
