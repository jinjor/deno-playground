import * as expressive from "../index.ts";

(async () => {
  const port = 3000;
  const app = new expressive.App();
  app.use(expressive.simpleLog());
  app.use(expressive.static_("./public"));
  app.use(expressive.bodyParser.json());
  app.get("/api/todos", async req => {
    req.json(todos);
  });
  app.post("/api/todos", async req => {
    const todo = {
      id: id++,
      name: req.data.name
    };
    todos.push(todo);
    await req.json(todo);
  });
  app.get("/api/todos/{id}", async req => {
    await req.json(todos[req.params.id]);
  });
  const server = await app.listen(port);
  console.log("app listening on port " + server.port);
})();

const todos = [];
let id = 0;
