import {
  args,
  exit,
  ProcessStatus,
  Closer,
  DenoError,
  ErrorKind,
  Process
} from "deno";
import * as deno from "deno";
import * as flags from "https://deno.land/x/flags/index.ts";
import watch from "https://raw.githubusercontent.com/jinjor/deno-watch/1.0.0/mod.ts";
import * as path from "https://deno.land/x/path/index.ts";

type Tasks = { [name: string]: Command };
interface ResolvingState {
  checked: Set<string>;
}
class ProcessError extends Error {
  constructor(
    public pid: number,
    public rid: number,
    public status: ProcessStatus,
    public taskName?: string
  ) {
    super("Process exited with status code " + status.code);
  }
}
interface Command {
  resolveRef(tasks: Tasks, state: ResolvingState): Command;
  run(args: string[], context: RunContext): Promise<void>;
}
class Single implements Command {
  constructor(public name: string, public args: string[]) {}
  resolveRef(tasks, { checked }) {
    return this;
  }
  async run(args, { cwd, resources }) {
    let p;
    try {
      p = deno.run({
        args: [this.name, ...this.args, ...args],
        cwd: cwd,
        stdout: "inherit",
        stderr: "inherit"
      });
    } catch (e) {
      if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
        throw new Error(`Command "${this.name}" not found.`);
      }
      throw e;
    }
    const closer = {
      close() {
        kill(p);
      }
    };
    resources.add(closer);
    const status = await p.status();
    p.close();
    resources.delete(closer);
    if (!status.success) {
      throw new ProcessError(p.pid, p.rid, status);
    }
  }
}
async function kill(p: Process) {
  const k = deno.run({
    args: ["kill", `${p.pid}`],
    stdout: "inherit",
    stderr: "inherit"
  });
  await k.status();
  k.close();
}

class Ref implements Command {
  constructor(public name: string, public args: string[]) {}
  resolveRef(tasks, { checked }) {
    let command = tasks[this.name];
    if (!command) {
      throw new Error(`Task "${this.name}" is not defined.`);
    }
    if (checked.has(this.name)) {
      throw new Error(`Task "${this.name}" is in a reference loop.`);
    }
    if (command instanceof Single) {
      command = new Single(command.name, command.args.concat(this.args));
    }
    return command.resolveRef(tasks, {
      checked: new Set(checked).add(this.name)
    });
  }
  async run(args, options) {
    throw new Error("Ref should be resolved before running.");
  }
}
class Sequence implements Command {
  commands: Command[];
  constructor(commands: Command[]) {
    this.commands = commands;
  }
  resolveRef(tasks, state) {
    return new Sequence(
      this.commands.map(c => {
        return c.resolveRef(tasks, state);
      })
    );
  }
  async run(args, context) {
    if (args.length) {
      throw new Error("Cannot pass args to sequential tasks.");
    }
    for (let command of this.commands) {
      await command.run([], context);
    }
  }
}
class Parallel implements Command {
  commands: Command[];
  constructor(commands: Command[]) {
    this.commands = commands;
  }
  resolveRef(tasks, state) {
    return new Parallel(
      this.commands.map(c => {
        return c.resolveRef(tasks, state);
      })
    );
  }
  async run(args, context) {
    if (args.length) {
      throw new Error("Cannot pass args to parallel tasks.");
    }
    await Promise.all(this.commands.map(c => c.run([], context)));
  }
}
class SyncWatcher implements Command {
  constructor(public dirs: string[], public command: Command) {}
  resolveRef(tasks, state) {
    return new SyncWatcher(this.dirs, this.command.resolveRef(tasks, state));
  }
  async run(args, context) {
    const dirs_ = this.dirs.map(d => {
      return path.join(context.cwd, d);
    });
    const childResources = new Set();
    const closer = {
      close() {
        closeResouces(childResources);
      }
    };
    context.resources.add(closer);
    await this.command
      .run(args, { ...context, resources: childResources })
      .catch(_ => {});
    for await (const _ of watch(dirs_)) {
      closeResouces(childResources);
      await this.command
        .run(args, { ...context, resources: childResources })
        .catch(_ => {});
    }
    context.resources.delete(closer);
  }
}
class AsyncWatcher implements Command {
  constructor(public dirs: string[], public command: Command) {}
  resolveRef(tasks, state) {
    return new AsyncWatcher(this.dirs, this.command.resolveRef(tasks, state));
  }
  async run(args, context) {
    const dirs_ = this.dirs.map(d => {
      return path.join(context.cwd, d);
    });
    const childResources = new Set();
    const closer = {
      close() {
        closeResouces(childResources);
      }
    };
    context.resources.add(closer);
    this.command
      .run(args, { ...context, resources: childResources })
      .catch(_ => {});
    for await (const _ of watch(dirs_)) {
      closeResouces(childResources);
      this.command
        .run(args, { ...context, resources: childResources })
        .catch(_ => {});
    }
    context.resources.delete(closer);
  }
}

function closeResouces(resources: Set<Closer>) {
  for (let resource of resources) {
    resource.close();
  }
  resources.clear();
}

const tasks: Tasks = {};
let runCalled = false;
class TaskExtender {
  constructor(public tasks: Tasks, public name: string) {}
  watchSync(dirs: string | string[]) {
    if (typeof dirs === "string") {
      dirs = [dirs];
    }
    this.tasks[this.name] = new SyncWatcher(dirs, this.tasks[this.name]);
  }
  watch(dirs: string | string[]) {
    if (typeof dirs === "string") {
      dirs = [dirs];
    }
    this.tasks[this.name] = new AsyncWatcher(dirs, this.tasks[this.name]);
  }
}

export function task(
  name: string,
  ...rawCommands: (string | string[])[]
): TaskExtender {
  if (name.split(/\s/).length > 1) {
    throw new Error(`Task name "${name}" is invalid.`);
  }
  if (task[name]) {
    throw new Error(`Task name "${name}" is duplicated.`);
  }
  tasks[name] = makeCommand(rawCommands);
  return new TaskExtender(tasks, name);
}

function makeCommand(rawCommands: (string | string[])[]): Command {
  if (rawCommands.length === 0) {
    throw new Error("Task needs at least one command.");
  }
  if (rawCommands.length === 1) {
    return makeNonSequenceCommand(rawCommands[0]);
  }
  return new Sequence(rawCommands.map(makeNonSequenceCommand));
}
function makeNonSequenceCommand(rawCommand: string | string[]): Command {
  if (typeof rawCommand === "string") {
    return makeSingleCommand(rawCommand);
  }
  return new Parallel(rawCommand.map(makeSingleCommand));
}
function makeSingleCommand(raw: string) {
  const splitted = raw.split(/\s/);
  if (!splitted.length) {
    throw new Error("Command should not be empty.");
  }
  const name = splitted[0];
  const args = splitted.splice(1);
  if (name.charAt(0) === "$") {
    const taskName = name.slice(1);
    if (!taskName.length) {
      throw new Error("Task name should not be empty.");
    }
    return new Ref(taskName, args);
  }
  return new Single(name, args);
}

interface RunContext {
  cwd: string;
  resources: Set<Closer>;
}
export async function run(
  taskName: string,
  args: string[],
  context: RunContext
) {
  runCalled = true;
  let command = tasks[taskName];
  if (!command) {
    throw new Error(`Task "${taskName}" not found.`);
  }
  await command.resolveRef(tasks, { checked: new Set() }).run(args, context);
}

new Promise(resolve => setTimeout(resolve, 0))
  .then(async () => {
    if (runCalled) {
      return;
    }
    const parsedArgs = flags.parse(args);
    const cwd = parsedArgs.cwd || ".";
    const taskName = parsedArgs._[1];
    const taskArgs = parsedArgs._.splice(2);
    if (!taskName) {
      console.log("Usage: task_file.ts task_name [--cwd]");
      exit(0);
    }
    const context = {
      cwd,
      resources: new Set()
    };
    await run(taskName, taskArgs, context);
  })
  .catch(e => {
    console.error(e.message);
    exit(1);
  });
