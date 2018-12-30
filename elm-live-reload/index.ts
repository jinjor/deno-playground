import { run } from "deno";
import { expressive, path, opn, watch } from "package.ts";

export async function main(
  main: string,
  index: string,
  distDir: string,
  watchDir: string,
  port: number
) {
  let shouldRefresh = false;
  const app = new expressive.App();
  // app.use(expressive.simpleLog());
  app.use(expressive.static_("./public"));
  app.use(expressive.static_(distDir));
  app.use(expressive.bodyParser.json());
  app.get("/", async req => {
    await req.file(index, html => {
      return html.replace("</head>", `<script>${reloader}</script></head>`);
    });
  });
  app.get("/live", async req => {
    if (shouldRefresh) {
      shouldRefresh = false;
      await req.empty(205);
    } else {
      await req.empty(200);
    }
  });
  app.on("errorThrown", async req => {
    console.log(req.error);
    await req.empty(500);
  });
  app.listen(port, () => {
    console.log("server listening on port " + port + ".");
    opn("http://localhost:" + port);
  });
  watch(watchDir, {
    interval: 500
  }).start(async () => {
    const code = await compile(main, distDir);
    if (code === 0) {
      shouldRefresh = true;
    }
  });
}

function compile(main: string, distDir: string): Promise<number> {
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
