import { writeFile, env, mkdir, remove } from "deno";
import watch from "index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";

function randomName(pre = "", post = ""): string {
  return pre + Math.floor(Math.random() * 100000) + post;
}
let tmpDir = env().TMPDIR || env().TEMP || env().TMP || "/tmp";
tmpDir = path.join(tmpDir, randomName("watch-test"));

test(async function Watch() {
  await mkdir(tmpDir);
  let result = [];
  const end = watch(tmpDir).start(changes => {
    result = result.concat(changes);
  });
  try {
    const filePath = path.join(tmpDir, randomName("", ".txt"));
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
    end();
  }
});

test(async function WatchByGenerator() {
  await mkdir(tmpDir);
  const watcher = watch(tmpDir);
  const filePath = path.join(tmpDir, randomName("", ".txt"));
  setTimeout(async () => {
    await writeFile(filePath, new Uint8Array(0));
  }, 100);
  for await (const changes of watcher) {
    watcher.end();
  }
});
