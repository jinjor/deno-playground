# Watch

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
