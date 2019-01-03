# Watch

A pure deno file watcher.

## Example

```typescript
for await (const changes of watch("src")) {
  console.log(changes.added);
  console.log(changes.modified);
  console.log(changes.deleted);
}
```

```typescript
const end = watch("src").start(changes => {
  console.log(changes);
});
```

## Options

Written in the [source code](./index.ts).

## Benchmark

```
test Benchmark
generated 10930 files.
[Add]
took 183ms to traverse 11232 files
took 147ms to traverse 11542 files
took 142ms to traverse 11845 files
[Modify]
took 139ms to traverse 11891 files
took 136ms to traverse 11891 files
took 154ms to traverse 11891 files
[Delete]
took 138ms to traverse 11608 files
took 134ms to traverse 11274 files
took 145ms to traverse 10960 files
... ok
```
