import { task } from "mod.ts";

task("prepare", "echo preparing...");
task("counter", "deno counter.ts");
task("thumb", "deno https://deno.land/thumb.ts");
task("all", "$prepare", ["$counter alice", "$counter bob"], "$thumb");
task("start", "echo changed", "$all").when(".");

task("server", "deno server.ts");
// task("reboot", "$server").when(".");
// task("demon", "echo starting server...", ["$server", "$reboot"]);
// task("demon", "echo starting server...", "$server").restart(".");
task("demon", "deno server.ts").restart(".");
