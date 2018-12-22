import { args, run, stat, readFile, exit } from "deno";
import { parse } from "https://deno.land/x/flags/index.ts";
import { serve } from "https://deno.land/x/net/http.ts";

const parsedArgs = parse(args);
const mainFile = parsedArgs._[1];
const indexHtml = parsedArgs._[2];
const port = parsedArgs.p || parsedArgs.port || 3000;
const help = parsedArgs.h || parsedArgs.help;
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
    deno ./start.ts src/Main.elm src/index.html --allow-net --allow-run`
  );
  console.log();
}

main(mainFile, indexHtml, port);

async function main(main: string, index: string, port: number) {
  let lastModified = null;
  let shouldRefresh = false;
  (async () => {
    const s = serve("127.0.0.1:" + port);
    console.log("server listening on " + port + ".");
    for await (const req of s) {
      // Note: turn on to show all accesses.
      // console.log(req.method, req.url);
      if (req.url === "/") {
        const data = await readFile(index);
        const decoder = new TextDecoder();
        const html = decoder
          .decode(data)
          .replace("</head>", `<script>${reloader}</script></head>`);
        const body = new TextEncoder().encode(html);
        const headers = new Headers();
        headers.append("Content-Type", "text/html");
        headers.append("Content-Length", body.byteLength.toString());
        req.respond({
          status: 200,
          headers: headers,
          body: body
        });
      } else if (req.url === "/elm.js") {
        const data = await readFile("dist/elm.js");
        const decoder = new TextDecoder();
        const js = decoder.decode(data);
        const body = new TextEncoder().encode(js);
        const headers = new Headers();
        headers.append("Content-Type", "text/javascript");
        headers.append("Content-Length", body.byteLength.toString());
        req.respond({ status: 200, headers, body });
      } else if (req.url === "/live") {
        const body = new TextEncoder().encode("");
        const headers = new Headers();
        headers.append("Content-Type", "text/plain");
        headers.append("Content-Length", "0");
        if (shouldRefresh) {
          shouldRefresh = false;
          req.respond({ status: 205, headers, body });
        } else {
          req.respond({ status: 200, headers, body });
        }
      } else {
        const body = new TextEncoder().encode("");
        const headers = new Headers();
        headers.append("Content-Type", "text/plain");
        headers.append("Content-Length", "0");
        req.respond({ status: 404, headers, body });
      }
      // Note: Content-Length is necessary to avoid connection leak.
    }
  })();
  while (true) {
    lastModified = await watch(main, lastModified);
    const code = await compile(main);
    if (code === 0) {
      shouldRefresh = true;
    }
  }
}

async function watch(main: string, lastModified: number): Promise<number> {
  while (true) {
    const fileInfo = await stat(main);
    if (!lastModified && fileInfo) {
      return fileInfo.modified;
    }
    if (lastModified && lastModified < fileInfo.modified) {
      return fileInfo.modified;
    }
    await new Promise(resolve => {
      setTimeout(resolve, 500);
    });
  }
}

function compile(main: string): Promise<number> {
  return new Promise(async resolve => {
    const process = run({
      args: ["elm", "make", main, "--output", "dist/elm.js"],
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
      console.log(res.status);
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
