import {
  readDir,
  readlink,
  lstatSync,
  lstat,
  readDirSync,
  readlinkSync,
  FileInfo
} from "deno";
import { assert } from "https://deno.land/x/testing/testing.ts";

/** The result of checking in one loop */
export class Changes {
  /** Paths of added files */
  added: string[] = [];
  /** Paths of modified files */
  modified: string[] = [];
  /** Paths of deleted files */
  deleted: string[] = [];
  /** The time[posix ms] when the checking started. */
  startTime: number;
  /** The time[posix ms] when the checking ended. */
  endTime: number;
  /** Current file count */
  fileCount = 0;
  /** added + modified + deleted */
  get length(): number {
    return this.added.length + this.modified.length + this.deleted.length;
  }
  /** all changed paths */
  get all(): string[] {
    return [...this.added, ...this.modified, ...this.deleted];
  }
  /** The time[ms] took for checking. */
  get time() {
    return this.endTime - this.startTime;
  }
}

/** Options */
export interface Options {
  /** The minimum interval[ms] of checking loop.
   * The next checking can be delayed until user program ends.
   *
   * |<------------------ interval ----------------->|<---------------
   * |<-- checking -->|                              |<-- checking -->
   *                  |<--- user program --->|
   *
   *
   * |<---------- interval --------->|       |<-----------------------
   * |<-- checking -->|                      |<-- checking -->
   *                  |<--- user program --->|
   */
  interval?: number;
  /** If true, watcher checks the symlinked files/directories too. */
  followSymlink?: boolean;
  /** Ignores something like .gitignore, .vscode, etc. */
  ignoreDotFiles?: boolean;
  /** Path to search in regex (ex. "\.(ts|css)$") */
  test?: RegExp | string;
  /** Path to ignore in regex. */
  ignore?: RegExp | string;
}

/** The watcher */
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

/**
 * Watch directories and detect changes.
 * @example
 * // Basic usage.
 * for await (const changes of watch("src")) {
 *   console.log(changes.added);
 *   console.log(changes.modified);
 *   console.log(changes.deleted);
 * }
 * @example
 * // Kill watcher from outside of the loop.
 * const end = watch("src").start(changes => {
 *   console.log(changes);
 * });
 * end();
 * @param dirs
 * @param options
 */
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
    if (f.isFile()) {
      if (!testRegex.test(path)) {
        return false;
      }
      if (ignoreRegex.test(path)) {
        return false;
      }
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
    let linkPath;
    let path;
    let info;
    if (typeof f === "string") {
      path = f;
      info = await (followSymlink ? statTraverse : lstat)(f);
    } else if (f.isSymlink() && followSymlink) {
      linkPath = f.path;
      info = await statTraverse(f.path);
      path = info.path;
    } else {
      path = f.path;
      info = f;
    }
    assert(!!path, "path not found");
    if (!filter(info, linkPath || path)) {
      continue;
    }
    if (info.isDirectory()) {
      const files = await readDir(path);
      promises.push(walk(prev, curr, files, followSymlink, filter, changes));
    } else if (info.isFile()) {
      if (curr[path]) {
        continue;
      }
      curr[path] = info.modified || info.created;
      if (!prev[path]) {
        changes.added.push(path);
      } else if (prev[path] < curr[path]) {
        changes.modified.push(path);
      }
      delete prev[path];
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
    let linkPath;
    let path;
    let info;
    if (typeof f === "string") {
      path = f;
      info = (followSymlink ? statTraverseSync : lstatSync)(f);
    } else if (f.isSymlink() && followSymlink) {
      linkPath = f.path;
      path = readlinkSync(f.path);
      info = statTraverseSync(path);
    } else {
      path = f.path;
      info = f;
    }
    assert(!!path, "path not found");
    if (!filter(info, linkPath || path)) {
      continue;
    }
    if (info.isDirectory()) {
      collect(all, readDirSync(path), followSymlink, filter);
    } else if (info.isFile()) {
      all[path] = info.modified || info.created;
    }
  }
}

// Workaround for non-linux
async function statTraverse(path: string): Promise<FileInfo> {
  const info = await lstat(path);
  if (info.isSymlink()) {
    const targetPath = await readlink(path);
    return statTraverse(targetPath);
  } else {
    info.path = path;
    return info;
  }
}
function statTraverseSync(path: string): FileInfo {
  const info = lstatSync(path);
  if (info.isSymlink()) {
    const targetPath = readlinkSync(path);
    return statTraverseSync(targetPath);
  } else {
    info.path = path;
    return info;
  }
}
