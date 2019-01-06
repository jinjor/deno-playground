import { task } from "mod.ts";

task("prepare", "echo preparing...");
task("counter", "deno counter.ts");
task("thumb", "deno https://deno.land/thumb.ts");
task("all", "$prepare", ["$counter alice", "$counter bob"], "$thumb");
task("start", "echo changed", "$all").watchSync(".");

task("server", "deno server.ts");
task("dev", "echo restarting...", "$server").watch(".");
task("dev1", "$dev").watch(".");
