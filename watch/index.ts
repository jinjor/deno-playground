import { readDir, readlink, lstat } from "deno";

export interface Change {
  action: "ADDED" | "MODIFIED" | "DELETED";
  file: string;
}
export interface Options {
  interval?: number;
  followSymlink?: boolean;
  ignoreDotFiles?: boolean;
  log?: Function;
}
const defaultOptions = {
  interval: 1000,
  followSymlink: false,
  ignoreDotFiles: true,
  log: null
};

interface Watcher extends AsyncIterable<string[]> {
  start(callback: (changes: string[]) => void): () => void;
  end: () => void;
}

export default function watch(dir: string, options?: Options): Watcher {
  options = Object.assign({}, defaultOptions, options);
  let abort = false;
  let timeout = null;
  async function* gen() {
    let [files] = await detectChanges({}, dir, options);
    while (true) {
      await new Promise(resolve => {
        timeout = setTimeout(resolve, options.interval);
      });
      if (abort) {
        break;
      }
      let start = Date.now();
      const [newFiles, changes] = await detectChanges(files, dir, options);
      files = newFiles;
      let end = Date.now();
      options.log &&
        options.log(
          `took ${end - start}ms to traverse ${Object.keys(files).length} files`
        );
      yield changes;
    }
  }
  return {
    [Symbol.asyncIterator]: gen,
    start: function(callback) {
      (async () => {
        for await (const changes of gen()) {
          callback(changes);
        }
      })();
      return this.end.bind(this);
    },
    end() {
      abort = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

async function detectChanges(
  prev: any,
  dir: string,
  { followSymlink, ignoreDotFiles }: Options
): Promise<[any, string[] | null]> {
  const curr = {};
  const changes = [];
  function push(change) {
    changes.push(change);
  }
  await walk(prev, curr, dir, followSymlink, ignoreDotFiles, push);
  for (let path in prev) {
    push({
      action: "DELETED",
      file: path
    });
  }
  return [curr, changes.length ? changes : null];
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
