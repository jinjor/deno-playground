import mimes = require("https://raw.githubusercontent.com/jshttp/mime-db/master/db.json");

const dict = {};
for (let t in mimes) {
  for (let ext of mimes[t].extensions || []) {
    dict[ext] = t;
  }
}

export function getType(ext) {
  return dict[ext];
}
