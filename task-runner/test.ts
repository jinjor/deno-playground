import { task } from "mod.ts";

task("prepare", "echo preparing...");
task("counter", "deno counter.ts");
task("thumb", "deno https://deno.land/thumb.ts");
task("test", "prepare", ["counter alice", "counter bob"], "thumb");
