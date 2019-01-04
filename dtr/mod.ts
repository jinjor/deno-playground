#!/usr/bin/env deno --allow-run

type Permission = "env" | "write" | "run" | "net";

export function lib(
  alias: string,
  path: string,
  permissions: Permission[]
): void {}
export function task(name: string, command: string) {}
