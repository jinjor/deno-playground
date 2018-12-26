import { writeFile, env, exit, mkdir, remove } from "deno";
import watch from "index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";

function randomFileName() {
  return Math.floor(Math.random() * 100000) + "txt";
}
let tmpDir = env().TMPDIR || env().TEMP || env().TMP || "/tmp";
tmpDir = path.join(tmpDir, "watch-test");

test(async function Watch() {
  await mkdir(tmpDir);
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
