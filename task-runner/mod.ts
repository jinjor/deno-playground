import { args, exit, ProcessStatus } from "deno";
import * as deno from "deno";
import * as flags from "https://deno.land/x/flags/index.ts";

type Tasks = { [name: string]: Command };
interface ResolvingState {
  checked: Set<string>;
}
class ProcessError extends Error {
  constructor(public status: ProcessStatus, public taskName?: string) {
    super("Process exited with status code " + status.code);
  }
}
interface Command {
  resolveRef(tasks: Tasks, state: ResolvingState): Command;
  run(args: string[], { cwd: string }): Promise<void>;
}
class Single implements Command {
  constructor(public name: string, public args: string[]) {}
  static fromRaw(raw: string) {
    const splitted = raw.split(/\s/);
    if (!splitted.length) {
      throw new Error("Command should not be empty.");
    }
    return new Single(splitted[0], splitted.splice(1));
  }
  resolveRef(tasks, { checked }) {
    let command = tasks[this.name];
    if (!command) {
      return this;
    }
    if (checked.has(this.name)) {
      throw new Error(`Task [${this.name}] is in a reference loop.`);
    }
    if (command instanceof Single) {
      command = new Single(command.name, command.args.concat(this.args));
    }
    return command.resolveRef(tasks, {
      checked: new Set(checked).add(this.name)
    });
  }
  async run(args, { cwd }) {
    const p = deno.run({
      args: [this.name, ...this.args, ...args],
      cwd: cwd,
      stdout: "inherit",
      stderr: "inherit"
    });
    const status = await p.status();
    if (!status.success) {
      throw new ProcessError(status);
    }
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
  async run(args, options) {
    for (let command of this.commands) {
      await command.run([], options);
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
  async run(args, options) {
    await Promise.all(this.commands.map(c => c.run([], options)));
  }
}

const tasks: Tasks = {};
let runCalled = false;

export function task(name: string, ...rawCommands: (string | string[])[]) {
  if (name.split(/\s/).length > 1) {
    throw new Error(`Task name [${name}] is invalid.`);
  }
  if (task[name]) {
    throw new Error(`Task name [${name}] is duplicated.`);
  }
  tasks[name] = makeCommand(rawCommands);
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
    return Single.fromRaw(rawCommand);
  }
  return new Parallel(rawCommand.map(Single.fromRaw));
}

interface Options {
  cwd: string;
}
export async function run(taskName: string, args: string[], options: Options) {
  runCalled = true;
  let command = tasks[taskName];
  if (!command) {
    throw new Error(`Task [${taskName}] not found.`);
  }
  await command.resolveRef(tasks, { checked: new Set() }).run(args, options);
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

    await run(taskName, taskArgs, { cwd });
  })
  .catch(e => {
    console.error(e.message);
    exit(1);
  });
