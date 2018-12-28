document.getElementById("add").addEventListener("click", () => {
  const value = document.getElementById("input").value;
  fetch("/api/todos", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: value
    })
  })
    .then(res => res.json())
    .then(todo => {
      document.getElementById("list").innerHTML = `<li>${todo.name}</li>`;
    });
});
