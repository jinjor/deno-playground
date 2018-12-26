import { args, run, stat, readFile, exit } from "deno";
import { flags, http, expressive, path, opn, watch } from "./package.ts";

const parsedArgs = flags.parse(args);
const mainFile = parsedArgs._[1];
const indexHtml = parsedArgs._[2];
const port = parsedArgs.p || parsedArgs.port || 3000;
const help = parsedArgs.h || parsedArgs.help;
const distDir = "./elm-stuff/elm-live-reload";
const watchDir = "./src";
if (help) {
  showUsage();
  exit(0);
}
if (!mainFile || !indexHtml) {
  showUsage();
  exit(1);
}
function showUsage() {
  console.log();
  console.log(
    `Usage:
    deno path/to/elm-live-reload.ts src/Main.elm src/index.html --allow-net --allow-run`
  );
  console.log();
}

main(mainFile, indexHtml, port);

async function main(main: string, index: string, port: number) {
  let shouldRefresh = false;
  (async () => {
    const serve_ = expressive.intercept(
      http.serve,
      [
        async function requestLogger(req) {
          // console.log(req.method, req.url);
        },
        expressive.static_("./public"),
        expressive.static_(distDir),
        expressive.route([
          expressive.get("/", async req => {
            const data = await readFile(index);
            const decoder = new TextDecoder();
            const html_ = decoder
              .decode(data)
              .replace("</head>", `<script>${reloader}</script></head>`);
            await expressive.html(req, html_);
          }),
          expressive.get("/live", async req => {
            if (shouldRefresh) {
              shouldRefresh = false;
              await expressive.empty(req, 205);
            } else {
              await expressive.empty(req, 200);
            }
          })
        ])
      ],
      {
        "404": async req => {
          await expressive.empty(req, 404);
        },
        "500": async (req, { error }) => {
          error && console.log(error);
          await expressive.empty(req, 500);
        }
      }
    );
    serve_("127.0.0.1:" + port);
    console.log("server listening on " + port + ".");
    opn("http://localhost:" + port);
  })();
  watch.one(
    watchDir,
    async () => {
      const code = await compile(main);
      if (code === 0) {
        shouldRefresh = true;
      }
    },
    {
      interval: 500
    }
  );
}

function compile(main: string): Promise<number> {
  return new Promise(async resolve => {
    const process = run({
      args: ["elm", "make", main, "--output", path.join(distDir, "elm.js")],
      stdout: "inherit",
      stderr: "inherit"
    });
    const status = await process.status();
    resolve(status.code);
  });
}

const reloader = `
  errorCount = 0;
  function live() {
    fetch("/live").then(res => {
      // console.log(res.status);
      if (res.status === 205) {
        errorCount = 0;
        location.reload();
      } else if (res.status === 200) {
        errorCount = 0;
        setTimeout(live, 1000);
      } else {
        errorCount++;
        if(errorCount > 10) {
          console.log("stopped connection.");
        } else {
          setTimeout(live, 1000);
        }
      }
    }).catch(e => {
      errorCount++;
      if(errorCount > 10) {
        console.log("stopped connection.");
      } else {
        setTimeout(live, 1000);
      }
    });
  }
  live();
`;
