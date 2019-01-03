import {
  writeFile,
  symlink,
  mkdir,
  remove,
  removeAll,
  makeTempDir,
  resources
} from "deno";
import watch from "index.ts";
import * as path from "https://deno.land/x/path/index.ts";
import {
  test,
  assert,
  assertEqual
} from "https://deno.land/x/testing/testing.ts";

function randomName(pre = "", post = ""): string {
  return pre + Math.floor(Math.random() * 100000) + post;
}

test(async function Watch() {
  const tmpDir = await makeTempDir();
  try {
    let added = [];
    let modified = [];
    let deleted = [];
    const end = watch(tmpDir).start(changes => {
      added = added.concat(changes.added);
      modified = modified.concat(changes.modified);
      deleted = deleted.concat(changes.deleted);
    });
    function assertResult(a, m, d) {
      assertEqual(added.length, a);
      assertEqual(modified.length, m);
      assertEqual(deleted.length, d);
    }
    try {
      const filePath = path.join(tmpDir, randomName("", ".txt"));
      await writeFile(filePath, new Uint8Array(0));
      await new Promise(resolve => setTimeout(resolve, 100));
      assertResult(0, 0, 0);
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertResult(1, 0, 0);
      await writeFile(filePath, new Uint8Array(0));
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertResult(1, 1, 0);
      await remove(filePath);
      await new Promise(resolve => setTimeout(resolve, 1200));
      assertResult(1, 1, 1);
    } finally {
      end();
    }
  } finally {
    await removeAll(tmpDir);
  }
});

// test(async function Symlink() {
//   const tmpDir = await makeTempDir();
//   const anotherDir = await makeTempDir();
//   try {
//     let added = [];
//     let modified = [];
//     let deleted = [];
//     const end = watch(tmpDir, {
//       followSymlink: true
//     }).start(changes => {
//       added = added.concat(changes.added);
//       modified = modified.concat(changes.modified);
//       deleted = deleted.concat(changes.deleted);
//     });
//     function assertResult(a, m, d) {
//       assertEqual(added.length, a);
//       assertEqual(modified.length, m);
//       assertEqual(deleted.length, d);
//     }
//     try {
//       {
//         const filePath = path.join(anotherDir, randomName());
//         const linkPath = path.join(tmpDir, randomName());
//         await writeFile(filePath, new Uint8Array(0));
//         await symlink(filePath, linkPath);
//         await new Promise(resolve => setTimeout(resolve, 1200));
//         assertResult(1, 0, 0);
//       }
//     } finally {
//       end();
//     }
//   } finally {
//     await removeAll(tmpDir);
//   }
// });

test(async function filter() {
  const tmpDir = await makeTempDir();
  try {
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
      await writeFile(
        path.join(tmpDir, randomName("", ".ts")),
        new Uint8Array(0)
      );
      await writeFile(
        path.join(tmpDir, randomName("", ".js")),
        new Uint8Array(0)
      );
      await writeFile(
        path.join(tmpDir, randomName("", ".css")),
        new Uint8Array(0)
      );
      await new Promise(resolve => setTimeout(resolve, 1200));
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
  } finally {
    await removeAll(tmpDir);
  }
});

test(async function WatchByGenerator() {
  const tmpDir = await makeTempDir();
  try {
    const filePath = path.join(tmpDir, randomName("", ".txt"));
    setTimeout(async () => {
      await writeFile(filePath, new Uint8Array(0));
    }, 100);
    for await (const changes of watch(tmpDir)) {
      assertEqual(changes.length, 1);
      break;
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
    const end = watch(tmpDir).start(result => {
      console.log(
        `took ${result.time}ms to traverse ${result.fileCount} files`
      );
    });
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
            console.log("error");
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
