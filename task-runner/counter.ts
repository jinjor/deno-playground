import { args } from "deno";
let i = 0;
const interval = setInterval(() => {
  console.log(args[1] || "", ++i);
  if (i >= 5) {
    clearInterval(interval);
  }
}, 600);
