import { run } from "deno";
import * as expressive from "../index.ts";

const port = 3000;
const app = new expressive.App();
app.use(async req => {
  // console.log(req.method, req.url);
});
app.use(expressive.static_("./public"));
app.use(expressive.bodyParser.json());
app.get("/api/todos", async (req, res) => {
  res.json(todos);
});
app.post("/api/todos", async (req, res) => {
  const todo = {
    id: id++,
    name: req.data.name
  };
  todos.push(todo);
  res.json(todo);
});
app.get("/api/todos/{id}", async (req, res) => {
  res.json(todos[req.params.id]);
});
app.on("errorThrown", async (req, res) => {
  console.log(req.error);
  await res.empty(500);
});
app.listen(port);
console.log("app listening on port " + port);

const todos = [];
let id = 0;
