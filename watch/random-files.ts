import {
  removeAll,
  makeTempDirSync,
  writeFileSync,
  removeSync,
  symlinkSync,
  mkdirSync,
  run
} from "deno";
import * as path from "https://deno.land/x/path/index.ts";

export function genName(pre = "", post = ""): string {
  return pre + Math.floor(Math.random() * 100000) + post;
}

export async function inTmp(f: Function, keep = false) {
  const tmpDir = makeTempDirSync();
  try {
    await f(tmpDir);
  } finally {
    if (!keep) {
      await removeAll(tmpDir);
    }
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
