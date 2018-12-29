import { run } from "deno";
import { expressive, path, opn, watch, ws } from "package.ts";

export async function main(
  main: string,
  index: string,
  distDir: string,
  watchDir: string,
  port: number
) {
  const app = new expressive.App();
  app.use(async req => {
    // console.log(req.method, req.url);
  });
  app.use(expressive.static_("./public"));
  app.use(expressive.static_(distDir));
  app.use(expressive.bodyParser.json());
  app.get("/", async (req, res) => {
    await res.file(index, data => {
      const html = new TextDecoder().decode(data);
      return html.replace("</head>", `<script>${reloader}</script></head>`);
    });
  });
  app.get("/live", async (req, res) => {
    const [err, sock] = await ws.acceptWebSocket(req.raw);
    if (err) {
      console.error(err);
      return;
    }
    console.log("socket connected!");
    // (async () => {
    //   for await (const ev of sock.receive()) {
    //     if (typeof ev === "string") {
    //       // text message
    //       console.log("ws:Text", ev);
    //       // const err = await sock.send(ev);
    //       if (err) console.error(err);
    //     } else if (ev instanceof Uint8Array) {
    //       // binary message
    //       console.log("ws:Binary", ev);
    //     } else if (ws.isWebSocketPingEvent(ev)) {
    //       const [_, body] = ev;
    //       // ping
    //       console.log("ws:Ping", body);
    //     } else if (ws.isWebSocketCloseEvent(ev)) {
    //       // close
    //       const { code, reason } = ev;
    //       console.log("ws:Close", code, reason);
    //     }
    //   }
    // })();
    for await (const _ of watch(watchDir, {
      interval: 300
    })) {
      const code = await compile(main, distDir);
      if (code === 0) {
        const err = await sock.send("reload");
        if (err) {
          console.error(err);
        }
      }
    }
  });
  app.on("done", expressive.simpleLog());
  app.on("errorThrown", async (req, res) => {
    console.log(req.error);
    await res.empty(500);
  });
  app.listen(port, () => {
    console.log("server listening on port " + port + ".");
    opn("http://localhost:" + port);
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
  let errorCount = 0;
  var connection = new WebSocket('ws://localhost:3000/live', ['soap', 'xmpp']);
  connection.onopen = () => {
    console.log("ws: opened.")
  };
  connection.onerror = error => {
    console.log('ws: error ' + error);
    errorCount++;
    if(errorCount > 10) {
      // console.log("stopped connection.");
    }
  };
  connection.onmessage = function (e) {
    if(e.data === "reload") {
      errorCount = 0;
      location.reload();
    }
  };
`;
