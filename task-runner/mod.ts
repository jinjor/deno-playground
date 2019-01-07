import { args, exit, Closer } from "deno";
import * as flags from "https://deno.land/x/flags/index.ts";
import { TaskRunner, TaskDecorator } from "runner.ts";

const globalRunner = new TaskRunner();

export function task(
  name: string,
  ...rawCommands: (string | string[])[]
): TaskDecorator {
  return globalRunner.task(name, ...rawCommands);
}

new Promise(resolve => setTimeout(resolve, 0))
  .then(async () => {
    const parsedArgs = flags.parse(args);
    const cwd = parsedArgs.cwd;
    const taskName = parsedArgs._[1];
    const taskArgs = parsedArgs._.splice(2);
    if (!taskName) {
      throw new Error("Usage: task_file.ts task_name [--cwd]");
    }
    await globalRunner.run(taskName, taskArgs, { cwd });
  })
  .catch(e => {
    console.error(e.message);
    exit(1);
  });
