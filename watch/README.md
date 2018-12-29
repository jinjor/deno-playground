# Watch

## Example

```typescript
for await (const changes of watch(".")) {
  console.log(changes);
}
```

```typescript
watch(tmpDir).start(changes => {
  console.log(changes);
});
```

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
