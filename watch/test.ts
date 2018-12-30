import {
  writeFile,
  mkdir,
  remove,
  removeAll,
  makeTempDir,
  resources
} from "deno";
import watch from "index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";

function randomName(pre = "", post = ""): string {
  return pre + Math.floor(Math.random() * 100000) + post;
}

test(async function Watch() {
  const tmpDir = await makeTempDir();
  try {
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
  } finally {
    await removeAll(tmpDir);
  }
});

test(async function WatchByGenerator() {
  const tmpDir = await makeTempDir();
  try {
    const watcher = watch(tmpDir);
    const filePath = path.join(tmpDir, randomName("", ".txt"));
    setTimeout(async () => {
      await writeFile(filePath, new Uint8Array(0));
    }, 100);
    for await (const changes of watcher) {
      watcher.end();
    }
  } finally {
    await removeAll(tmpDir);
  }
});

test(async function Benchmark() {
  const tmpDir = await makeTempDir();
  try {
    const files = [];
    await generateManyFiles(tmpDir, files);
    console.log(`generated ${files.length} files.`);
    const end = watch(tmpDir, {
      log: s => {
        console.log(s);
      }
    }).start(function() {});
    try {
      console.log("[Add]");
      for (let i = 0; i < 1000; i++) {
        await new Promise(resolve => setTimeout(resolve, 2));
        let fileName = files[Math.floor(Math.random() * files.length)];
        fileName = fileName + ".added";
        await writeFile(fileName, new Uint8Array(0));
      }
      console.log("[Modify]");
      for (let i = 0; i < 1000; i++) {
        await new Promise(resolve => setTimeout(resolve, 2));
        await writeFile(
          files[Math.floor(Math.random() * files.length)],
          new Uint8Array(0)
        );
      }
      console.log("[Delete]");
      for (let i = 0; i < 1000; i++) {
        await new Promise(resolve => setTimeout(resolve, 2));
        const index = Math.floor(Math.random() * files.length);
        const fileName = files[index];
        if (fileName) {
          try {
            await remove(fileName);
          } catch (e) {
            console.log(e);
          }
        }
        files[index] = null;
      }
    } finally {
      end();
    }
  } finally {
    await removeAll(tmpDir);
  }
});
const DEPTH = 7;
const FILE_PER_DIR = 10;
const DIR_PER_DIR = 3;
async function generateManyFiles(dir, files, depth = DEPTH) {
  if (depth <= 0) {
    return;
  }
  for (let i = 0; i < FILE_PER_DIR; i++) {
    const file = path.join(dir, randomName("", ".txt"));
    files.push(file);
    await writeFile(file, new Uint8Array(0));
  }
  for (let i = 0; i < DIR_PER_DIR; i++) {
    const newDir = path.join(dir, randomName());
    await mkdir(newDir);
    await generateManyFiles(newDir, files, depth - 1);
  }
}
