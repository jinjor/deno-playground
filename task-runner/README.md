# task-runner

Write tasks just like npm scripts.

```typescript
import { task } from "mod.ts";

task("prepare", "echo preparing...");
task("counter", "deno counter.ts");
task("thumb", "deno https://deno.land/thumb.ts");
task("all", "prepare", ["counter alice", "counter bob"], "thumb");
//          ^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^
//          1st task   2nd task (parallel)               3rd task
```

```
$ deno example.ts all --allow-run
preparing...
bob 1
alice 1
alice 2
bob 2
alice 3
bob 3
alice 4
bob 4
bob 5
alice 5
👍
```
