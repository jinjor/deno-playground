import { args } from "deno";
const name = args[1] || "";
let i = 0;
const interval = setInterval(() => {
  console.log(name, ++i);
  if (i >= 5) {
    clearInterval(interval);
  }
}, 600);
