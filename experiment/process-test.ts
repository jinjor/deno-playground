import { run, resources, Process } from "deno";

(async () => {
  const p = run({
    args: ["deno", "task-runner/server.ts"],
    stdout: "inherit",
    stderr: "inherit"
  });
  console.log("(rid, pid):", p.rid, p.pid);
  setTimeout(async () => {
    console.log(resources());
    await killAndClose(p);
    console.log(resources());
  }, 1000);
})();
async function killAndClose(p: Process) {
  const k = run({
    args: ["kill", `${p.pid}`],
    stdout: "inherit",
    stderr: "inherit"
  });
  await k.status();
  k.close();
  await p.status();
  p.close();
}
