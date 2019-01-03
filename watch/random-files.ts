import {
  removeAll,
  makeTempDirSync,
  writeFileSync,
  removeSync,
  symlinkSync,
  mkdirSync,
  removeAllSync,
  run,
  DenoError,
  ErrorKind
} from "deno";
import * as path from "https://deno.land/x/path/index.ts";

export function genName(pre = "", post = ""): string {
  return pre + Math.floor(Math.random() * 100000) + post;
}

export async function inTmpDir(
  f: (dir: string) => Promise<void> | void,
  keepOnFailure = false
) {
  await inTmpDirs(
    1,
    async tmpDirs => {
      await f(tmpDirs[0]);
    },
    keepOnFailure
  );
}
export async function inTmpDirs(
  count: number,
  f: (dirs: string[]) => Promise<void> | void,
  keepOnFailure = false
) {
  const tmpDirs = [];
  for (let i = 0; i < count; i++) {
    tmpDirs.push(makeTempDirSync());
  }
  function cleanup() {
    tmpDirs.forEach(d => {
      try {
        removeAllSync(d);
      } catch (e) {
        if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
          // not a problem
        } else {
          console.error("WARN:", e.message);
        }
      }
    });
  }
  try {
    await f(tmpDirs);
    cleanup();
  } catch (e) {
    if (!keepOnFailure) {
      cleanup();
    }
    throw e;
  }
}
class F {
  constructor(public path: string, public isDir: boolean) {}
  modify() {
    writeFileSync(this.path, new Uint8Array(0));
  }
  remove() {
    if (this.isDir) {
      removeAll(this.path);
    } else {
      removeSync(this.path);
    }
  }
}
interface Options {
  prefix?: string;
  postfix?: string;
  amount?: number;
  isDir?: boolean;
}
const defaultOptions = {
  prefix: "",
  postfix: "",
  amount: 1,
  isDir: false
};
export function genFiles(dir: string, options: Options = {}): F[] {
  const amount = Math.max(options.amount, 1);
  options = { ...defaultOptions, ...options };
  const files = [];
  for (let i = 0; i < amount; i++) {
    const filePath = path.join(dir, genName(options.prefix, options.postfix));
    if (options.isDir) {
      mkdirSync(filePath);
    } else {
      writeFileSync(filePath, new Uint8Array(0));
    }
    files.push(new F(filePath, options.isDir));
  }
  return files;
}
export function genFile(dir: string, options: Options = {}): F {
  return genFiles(dir, { ...options, amount: 1 })[0];
}
export function genDirs(dir: string, options: Options = {}): F[] {
  return genFiles(dir, { ...options, isDir: true });
}
export function genDir(dir: string, options: Options = {}): F {
  return genDirs(dir, { ...options, isDir: true, amount: 1 })[0];
}
export function genLink(
  dir: string,
  pathToFile: string,
  options: Options = {}
): F {
  const linkPath = path.join(dir, genName(options.prefix, options.postfix));
  symlinkSync(pathToFile, linkPath);
  return new F(linkPath, options.isDir);
}
export async function tree(...args: string[]): Promise<void> {
  const process = run({
    args: ["tree", ...args],
    stdout: "inherit"
  });
  await process.status();
}
