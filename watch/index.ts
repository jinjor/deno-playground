import { readDir, readlink, stat, lstat, FileInfo } from "deno";

export interface Change {
  action: "ADDED" | "MODIFIED" | "DELETED";
  file: string;
}

export interface Options {
  interval: number;
  followSymlink: boolean;
  ignoreDotFiles: boolean;
  log?: Function;
}
const defaultOptions = {
  interval: 1000,
  followSymlink: false,
  ignoreDotFiles: true,
  log: null
};
type Mode = "one" | "stream" | "all";

export function one(dir: string, callback, options?: Options) {
  return watch(dir, callback, options || defaultOptions, "one");
}
export function stream(dir: string, callback, options?: Options) {
  return watch(dir, callback, options || defaultOptions, "stream");
}
export function all(dir: string, callback, options?: Options) {
  return watch(dir, callback, options || defaultOptions, "all");
}

async function watch(dir: string, callback, options: Options, mode: Mode) {
  let abort = false;
  let timeout = null;
  let files = await detectChanges({}, dir, function() {}, options, mode);
  (async () => {
    while (true) {
      await new Promise(resolve => {
        timeout = setTimeout(resolve, options.interval);
      });
      if (abort) {
        break;
      }
      let start = Date.now();
      files = await detectChanges(files, dir, callback, options, mode);
      let end = Date.now();
      options.log &&
        options.log(
          `took ${end - start}ms to traverse ${Object.keys(files).length} files`
        );
    }
  })();
  return function unwatch() {
    abort = true;
    if (timeout) {
      clearTimeout(timeout);
    }
  };
}

async function detectChanges(
  prev: any,
  dir: string,
  callback,
  options: Options,
  mode: Mode
): Promise<any> {
  const curr = {};
  const changes = [];
  let first = true;
  function push(change) {
    changes.push(change);
    if ((mode === "one" && first) || mode === "stream") {
      callback();
    }
    first = false;
  }
  await walk(
    prev,
    curr,
    dir,
    options.followSymlink,
    options.ignoreDotFiles,
    push
  );
  for (let path in prev) {
    push({
      action: "DELETED",
      file: path
    });
  }
  if (changes.length) {
    if (mode === "all") {
      callback(changes);
    }
  }
  return curr;
}

async function walk(
  prev: any,
  curr: any,
  dir: string,
  followSymlink: boolean,
  ignoreDotFiles: boolean,
  push: (change: Change) => void
): Promise<void> {
  let files = [];
  let dirInfo = await lstat(dir);
  if (dirInfo.isDirectory()) {
    files = await readDir(dir);
  } else if (dirInfo.isSymlink()) {
    if (followSymlink) {
      const path = await readlink(dir);
      files = await readDir(path);
    }
  }
  const promises = [];
  for (let f of files) {
    if (ignoreDotFiles && f.name.charAt(0) === ".") {
      continue;
    }
    if (f.isDirectory() || f.isSymlink()) {
      promises.push(
        walk(prev, curr, f.path, followSymlink, ignoreDotFiles, push)
      );
      continue;
    }
    curr[f.path] = f.modified || f.created;
    if (!prev[f.path]) {
      push({
        action: "ADDED",
        file: f.path
      });
    } else if (prev[f.path] < curr[f.path]) {
      push({
        action: "MODIFIED",
        file: f.path
      });
    }
    delete prev[f.path];
  }
  await Promise.all(promises);
}
