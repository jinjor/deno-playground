import { writeFile, env, exit, mkdir, remove } from "deno";
import watch from "./index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import { assertEqual } from "https://deno.land/x/testing/testing.ts";

const testCases = [];
function it(statement, func) {
  testCases.push({ statement, func });
}
async function run() {
  const results = [];
  for (let { statement, func } of testCases) {
    let ok = true;
    let err = null;
    try {
      await func();
    } catch (e) {
      ok = false;
      err = e;
    }
    err && console.log(err);
    results.push({
      statement,
      ok
    });
  }
  let failures = 0;
  for (let r of results) {
    if (!r.ok) {
      failures++;
    }
    console.log(`${r.ok ? "✅" : "❌"} ${r.statement}`);
  }
  exit(failures);
}
function randomFileName() {
  return Math.floor(Math.random() * 100000) + "txt";
}
(async () => {
  let tmpDir = env().TMPDIR || env().TEMP;
  if (!tmpDir) {
    console.error("tmp dir not found");
    exit(1);
  }
  tmpDir = path.join(tmpDir, "watch-test");
  await mkdir(tmpDir);

  await it("should detect add, modify, delete", async () => {
    let result = [];
    const unwatch = await watch(tmpDir, r => {
      result = result.concat(r);
    });
    try {
      const filePath = path.join(tmpDir, randomFileName());
      await writeFile(filePath, new Uint8Array(0));
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertEqual(1, result.length);
      await writeFile(filePath, new Uint8Array(0));
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertEqual(2, result.length);
      await remove(filePath);
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertEqual(3, result.length);
    } finally {
      unwatch();
    }
  });
  run();
})();
