import {
  readDir,
  readlink,
  lstatSync,
  stat,
  lstat,
  statSync,
  readDirSync,
  readlinkSync,
  FileInfo
} from "deno";
import { assert } from "https://deno.land/x/testing/testing.ts";

export class Changes {
  added: string[] = [];
  modified: string[] = [];
  deleted: string[] = [];
  startTime: number;
  endTime: number;
  fileCount = 0;
  get length(): number {
    return this.added.length + this.modified.length + this.deleted.length;
  }
  get all(): string[] {
    return [...this.added, ...this.modified, ...this.deleted];
  }
  get time() {
    return this.endTime - this.startTime;
  }
}

export interface Options {
  interval?: number;
  followSymlink?: boolean;
  ignoreDotFiles?: boolean;
  log?: (s: string) => void;
  test?: RegExp | string;
  ignore?: RegExp | string;
}

export interface Watcher extends AsyncIterable<Changes> {
  start(callback: (changes: Changes) => Promise<void> | void): () => void;
}

const defaultOptions = {
  interval: 1000,
  followSymlink: false,
  ignoreDotFiles: true,
  test: /.*/,
  ignore: /$^/
};

export default function watch(
  dirs: string | string[],
  options?: Options
): Watcher {
  const dirs_ = Array.isArray(dirs) ? dirs : [dirs];
  options = Object.assign({}, defaultOptions, options);
  return {
    [Symbol.asyncIterator]() {
      return run(dirs_, options);
    },
    start: function(callback: (changes: Changes) => Promise<void> | void) {
      const state = {
        abort: false,
        timeout: null
      };
      (async () => {
        for await (const changes of run(dirs_, options, state)) {
          await callback(changes);
        }
      })();
      return () => {
        state.abort = true;
        if (state.timeout) {
          clearTimeout(state.timeout);
        }
      };
    }
  };
}
async function* run(
  dirs: string[],
  options: Options,
  state = {
    abort: false,
    timeout: null
  }
) {
  const { interval, followSymlink } = options;
  const filter = makeFilter(options);
  let lastStartTime = Date.now();
  let files = {};
  collect(files, dirs, followSymlink, filter);

  while (!state.abort) {
    let waitTime = Math.max(0, interval - (Date.now() - lastStartTime));
    await new Promise(resolve => {
      state.timeout = setTimeout(resolve, waitTime);
    });
    state.timeout = null;
    lastStartTime = Date.now();
    let changes = new Changes();
    changes.startTime = lastStartTime;

    changes.fileCount = Object.keys(files).length;
    const newFiles = {};
    await detectChanges(files, newFiles, dirs, followSymlink, filter, changes);
    files = newFiles;

    changes.endTime = Date.now();
    if (changes.length) {
      yield changes;
    }
  }
}

function makeFilter({ test, ignore, ignoreDotFiles }: Options) {
  const testRegex = typeof test === "string" ? new RegExp(test) : test;
  const ignoreRegex = typeof ignore === "string" ? new RegExp(ignore) : ignore;
  return function filter(f: FileInfo, path: string) {
    if (ignoreDotFiles) {
      const splitted = path.split("/");
      const name = f.name || splitted[splitted.length - 1];
      if (name.charAt(0) === ".") {
        return false;
      }
    }
    if (!testRegex.test(path)) {
      return false;
    }
    if (ignoreRegex.test(path)) {
      return false;
    }
    return true;
  };
}

async function detectChanges(
  prev: any,
  curr: any,
  dirs: string[],
  followSymlink: boolean,
  filter: (f: FileInfo, path: string) => boolean,
  changes: Changes
): Promise<void> {
  await walk(prev, curr, dirs, followSymlink, filter, changes);
  Array.prototype.push.apply(changes.deleted, Object.keys(prev));
}

async function walk(
  prev: any,
  curr: any,
  files: (string | FileInfo)[],
  followSymlink: boolean,
  filter: (f: FileInfo, path: string) => boolean,
  changes: Changes
): Promise<void> {
  const promises = [];
  for (let f of files) {
    let path;
    let info;
    if (typeof f === "string") {
      path = f;
      info = await (followSymlink ? stat : lstat)(f);
    } else if (f.isSymlink() && followSymlink) {
      path = await readlink(f.path);
      info = await stat(path);
    } else {
      path = f.path;
      info = f;
    }
    assert(!!path, "path not found");
    if (info.isDirectory()) {
      const files = await readDir(path);
      promises.push(walk(prev, curr, files, followSymlink, filter, changes));
    } else if (info.isFile()) {
      if (filter(info, path)) {
        curr[path] = info.modified || info.created;
        if (!prev[path]) {
          changes.added.push(path);
        } else if (prev[path] < curr[path]) {
          changes.modified.push(path);
        }
        delete prev[path];
      }
    }
  }
  await Promise.all(promises);
}

function collect(
  all: any,
  files: (string | FileInfo)[],
  followSymlink: boolean,
  filter: (f: FileInfo, path?: string) => boolean
): void {
  for (let f of files) {
    let path;
    let info;
    if (typeof f === "string") {
      path = f;
      info = (followSymlink ? statSync : lstatSync)(f);
    } else if (f.isSymlink() && followSymlink) {
      path = readlinkSync(f.path);
      info = statSync(path);
    } else {
      path = f.path;
      info = f;
    }
    assert(!!path, "path not found");
    if (info.isDirectory()) {
      collect(all, readDirSync(path), followSymlink, filter);
    } else if (info.isFile()) {
      if (filter(info, path)) {
        all[path] = info.modified || info.created;
      }
    }
  }
}
