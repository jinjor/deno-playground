# Expressive

```typescript
import * as expressive from "https://raw.githubusercontent.com/jinjor/deno-playground/master/expressive/index.ts";

const port = 3000;
const app = new expressive.App();
app.use(expressive.static_("./public"));
app.use(expressive.bodyParser.json());
app.on("done", expressive.simpleLog());
app.listen(port, p => {
  console.log("app listening on port " + p);
});
```
