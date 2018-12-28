import { writeFile, env, mkdir, remove } from "deno";
import watch from "index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";

function randomFileName() {
  return Math.floor(Math.random() * 100000) + ".txt";
}
let tmpDir = env().TMPDIR || env().TEMP || env().TMP || "/tmp";
tmpDir = path.join(tmpDir, "watch-test");

test(async function Watch() {
  await mkdir(tmpDir);
  let result = [];
  const watcher = watch(tmpDir);
  (async () => {
    for await (const changes of watcher) {
      result = result.concat(changes);
    }
  })();
  try {
    const filePath = path.join(tmpDir, randomFileName());
    await writeFile(filePath, new Uint8Array(0));
    await new Promise(resolve => setTimeout(resolve, 100));
    assertEqual(result.length, 0);
    await new Promise(resolve => setTimeout(resolve, 1200));
    assertEqual(result.length, 1);
    await writeFile(filePath, new Uint8Array(0));
    await new Promise(resolve => setTimeout(resolve, 1200));
    assertEqual(result.length, 2);
    await remove(filePath);
    await new Promise(resolve => setTimeout(resolve, 1200));
    assertEqual(result.length, 3);
  } finally {
    watcher.end();
  }
  // await Promise.all([
  //   async () => {
  //     console.log(0);
  //     for await (const changes of watcher) {
  //       result = result.concat(changes);
  //     }
  //   },
  //   async () => {
  //     console.log(1);
  //     try {
  //       const filePath = path.join(tmpDir, randomFileName());
  //       await writeFile(filePath, new Uint8Array(0));
  //       await new Promise(resolve => setTimeout(resolve, 1200));
  //       assertEqual(result.length, 1);
  //       await writeFile(filePath, new Uint8Array(0));
  //       await new Promise(resolve => setTimeout(resolve, 1200));
  //       assertEqual(result.length, 2);
  //       await remove(filePath);
  //       await new Promise(resolve => setTimeout(resolve, 1200));
  //       assertEqual(result.length, 3);
  //     } finally {
  //       watcher.end();
  //     }
  //   }
  // ]);
});
