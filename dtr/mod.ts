#!/usr/bin/env deno --allow-run

type Permission = "env" | "write" | "run" | "net";

export function lib(
  alias: string,
  path: string,
  permissions: Permission[]
): void {}
export function task(name: string, command: string) {}
export function github(repo: string, path: string): string {
  repo = repo.split("@")[0];
  const branch = repo.split("@")[1] || "master";
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}
export function x() {}
