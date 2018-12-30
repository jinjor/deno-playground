document.getElementById("add").addEventListener("submit", e => {
  e.preventDefault();
  const value = document.getElementById("input").value;
  document.getElementById("input").value = "";
  fetch("/api/todos", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: value
    })
  }).then(reload);
});
document.getElementById("delete").addEventListener("click", e => {
  fetch(`/api/todos/0`, {
    method: "DELETE"
  }).then(reload);
});
function reload() {
  return fetch("/api/todos")
    .then(res => res.json())
    .then(todos => {
      let s = "";
      for (let todo of todos) {
        s += `<li>${todo.name}</li>`;
      }
      document.getElementById("list").innerHTML = s;
    });
}
reload();
