import { writeFile, remove, removeAll, makeTempDir } from "deno";
import watch from "index.ts";
import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";
import { inTmp, genFile, genDir, genLink } from "random-files.ts";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function assertChanges(changes, a, m, d) {
  try {
    assertEqual(changes.added.length, a);
    assertEqual(changes.modified.length, m);
    assertEqual(changes.deleted.length, d);
  } catch (e) {
    console.log("expected:", `${a} ${m} ${d}`);
    throw e;
  }
}
test(async function Watch() {
  await inTmp(async tmpDir => {
    let changes = { added: [], modified: [], deleted: [] };
    const end = watch(tmpDir).start(changes_ => {
      changes = changes_;
    });
    try {
      const f = genFile(tmpDir);
      await delay(100);
      assertChanges(changes, 0, 0, 0);
      await delay(1200);
      assertChanges(changes, 1, 0, 0);
      f.modify();
      await delay(1200);
      assertChanges(changes, 0, 1, 0);
      f.remove();
      await delay(1200);
      assertChanges(changes, 0, 0, 1);
    } finally {
      end();
    }
  });
});
test(async function Symlink() {
  const tmpDir = await makeTempDir();
  const anotherDir = await makeTempDir();
  try {
    let changes = { added: [], modified: [], deleted: [] };
    const end = watch(tmpDir, {
      followSymlink: true
    }).start(changes_ => {
      changes = changes_;
    });
    try {
      {
        const f = genFile(anotherDir);
        const link = genLink(tmpDir, f.path);
        await delay(1200);
        assertChanges(changes, 1, 0, 0);
        f.modify();
        await delay(1200);
        assertChanges(changes, 0, 1, 0);
      }
      {
        const f = genFile(anotherDir);
        const link1 = genLink(anotherDir, f.path);
        const link2 = genLink(tmpDir, link1.path);
        await delay(1200);
        assertChanges(changes, 1, 0, 0);
        f.modify();
        await delay(1200);
        assertChanges(changes, 0, 1, 0);
      }
      {
        const dir = genDir(anotherDir);
        const f = genFile(dir.path);
        const link = genLink(tmpDir, f.path);
        await delay(1200);
        assertChanges(changes, 1, 0, 0);
        f.modify();
        await delay(1200);
        assertChanges(changes, 0, 1, 0);
      }
    } finally {
      end();
    }
  } finally {
    await removeAll(tmpDir);
    await removeAll(anotherDir);
  }
});

test(async function dotFiles() {
  await inTmp(async tmpDir => {
    let changes = { added: [], modified: [], deleted: [] };
    const end = watch(tmpDir).start(changes_ => {
      changes = changes_;
    });
    try {
      const f = genFile(tmpDir, { prefix: "." });
      await delay(1200);
      assertChanges(changes, 0, 0, 0);
      const link = genLink(tmpDir, f.path);
      await delay(1200);
      assertChanges(changes, 0, 0, 0);
      const dir = genDir(tmpDir, { prefix: "." });
      genFile(dir.path);
      await delay(1200);
      assertChanges(changes, 0, 0, 0);
      f.remove();
      dir.remove();
      assertChanges(changes, 0, 0, 0);
    } finally {
      end();
    }
  });
});

test(async function filter() {
  await inTmp(async tmpDir => {
    let result1 = [];
    const end1 = watch(tmpDir).start(changes => {
      result1 = result1.concat(changes.added);
    });
    let result2 = [];
    const end2 = watch(tmpDir, { test: ".ts$" }).start(changes => {
      result2 = result2.concat(changes.added);
    });
    let result3 = [];
    const end3 = watch(tmpDir, { ignore: ".ts$" }).start(changes => {
      result3 = result3.concat(changes.added);
    });
    let result4 = [];
    const end4 = watch(tmpDir, { test: ".(ts|css)$", ignore: ".css$" }).start(
      changes => {
        result4 = result4.concat(changes.added);
      }
    );
    try {
      genFile(tmpDir, { postfix: ".ts" });
      genFile(tmpDir, { postfix: ".js" });
      genFile(tmpDir, { postfix: ".css" });
      await delay(1200);
      assertEqual(result1.length, 3);
      assertEqual(result2.length, 1);
      assertEqual(result3.length, 2);
      assertEqual(result4.length, 1);
    } finally {
      end1();
      end2();
      end3();
      end4();
    }
  });
});

test(async function WatchByGenerator() {
  await inTmp(async tmpDir => {
    setTimeout(async () => {
      const f = genFile(tmpDir);
    }, 100);
    for await (const changes of watch(tmpDir)) {
      assertChanges(changes, 1, 0, 0);
      break;
    }
  });
});

test(async function Benchmark() {
  await inTmp(async tmpDir => {
    const files = [];
    await generateManyFiles(tmpDir, files);
    console.log(`generated ${files.length} files.`);
    const end = watch(tmpDir).start(result => {
      console.log(
        `took ${result.time}ms to traverse ${result.fileCount} files`
      );
    });
    try {
      console.log("[Add]");
      for (let i = 0; i < 1000; i++) {
        await delay(2);
        let fileName = files[Math.floor(Math.random() * files.length)];
        fileName = fileName + ".added";
        await writeFile(fileName, new Uint8Array(0));
      }
      console.log("[Modify]");
      for (let i = 0; i < 1000; i++) {
        await delay(2);
        await writeFile(
          files[Math.floor(Math.random() * files.length)],
          new Uint8Array(0)
        );
      }
      console.log("[Delete]");
      for (let i = 0; i < 1000; i++) {
        await delay(2);
        const index = Math.floor(Math.random() * files.length);
        const fileName = files[index];
        if (fileName) {
          try {
            await remove(fileName);
          } catch (e) {
            console.log("error");
            console.log(e);
          }
        }
        files[index] = null;
      }
    } finally {
      end();
    }
  });
});

const DEPTH = 7;
const FILE_PER_DIR = 10;
const DIR_PER_DIR = 3;
async function generateManyFiles(dir, files, depth = DEPTH) {
  if (depth <= 0) {
    return;
  }
  for (let i = 0; i < FILE_PER_DIR; i++) {
    const f = genFile(dir, { postfix: ".txt" });
    files.push(f.path);
  }
  for (let i = 0; i < DIR_PER_DIR; i++) {
    const d = genDir(dir);
    await generateManyFiles(d.path, files, depth - 1);
  }
}
