import { color } from "https://deno.land/x/colors/main.ts";
import * as expressive from "../index.ts";

const port = 3000;
const app = new expressive.App();
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
app.on("done", async (req, res) => {
  if (res.status >= 500) {
    console.log(color.red(res.status + ""), req.method, req.url);
  } else if (res.status >= 400) {
    console.log(color.yellow(res.status + ""), req.method, req.url);
  } else if (res.status >= 300) {
    console.log(color.cyan(res.status + ""), req.method, req.url);
  } else {
    console.log(color.green(res.status + ""), req.method, req.url);
  }
});
app.listen(port, p => {
  console.log("app listening on port " + p);
});

const todos = [];
let id = 0;
