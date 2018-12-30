# Expressive

```typescript
import * as expressive from "https://raw.githubusercontent.com/jinjor/deno-playground/master/expressive/index.ts";

(async () => {
  const port = 3000;
  const app = new expressive.App();
  app.use(expressive.simpleLog());
  app.use(expressive.static_("./public"));
  app.use(expressive.bodyParser.json());
  app.get("/api/todos", async (req, res) => {
    await res.json([{ name: "Buy some milk" }]);
  });
  const server = await app.listen(port);
  console.log("app listening on port " + server.port);
})();
```
