import { stat, readFile, DenoError, ErrorKind } from "deno";
import { getType } from "mime.ts";
import { path, http } from "package.ts";

type Method = "GET" | "POST";
type Middleware = ((req: any) => Promise<string | void>) | PathHandler;
export interface PathHandler {
  method: Method;
  pattern: string;
  handle(req: any): Promise<string | void>;
}

const defaultEventHandlers = {
  "400": async req => {
    await empty(req, 400);
  },
  "404": async req => {
    await empty(req, 404);
  },
  "500": async req => {
    await empty(req, 500);
  }
};

export class App {
  middlewares: Middleware[] = [];
  eventHandlers = defaultEventHandlers;
  constructor() {}
  use(m: Middleware) {
    this.middlewares.push(m);
  }
  get(...args) {
    this.use(get.apply(null, args));
  }
  post(...args) {
    this.use(post.apply(null, args));
  }
  on(event: string, f: any) {
    this.eventHandlers[event] = f;
  }
  listen(port: number, host?: string) {
    const serve = intercept(http.serve, this.middlewares, this.eventHandlers);
    serve(`${host || "127.0.0.1"}:${port}`);
  }
}

export function intercept(
  serve_,
  middlewares: Middleware[],
  special: { [key: string]: any }
) {
  return async function serve(...args) {
    const s = serve_.apply(null, args);
    for await (const raw of s) {
      const req = { raw, ...raw, respond: raw.respond.bind(raw) };
      _parseURL(req);
      let flag = null;
      try {
        flag = await runMiddlewares(middlewares, req);
        flag = flag || "404";
      } catch (e) {
        req.error = e;
        if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
          flag = "404";
        } else {
          flag = "500";
        }
      }
      if (flag) {
        const f = special[flag];
        if (f) {
          f(req);
        }
      }
    }
  };
}
export function _parseURL(req) {
  const url = new URL("http://a.b" + req.url);
  req.path = url.pathname;
  const query = {};
  for (let [k, v] of new URLSearchParams(url.search) as any) {
    if (Array.isArray(query[k])) {
      query[k] = [...query[k], v];
    } else if (typeof query[k] === "string") {
      query[k] = [query[k], v];
    } else {
      query[k] = v;
    }
  }
  req.query = query;
}
async function runMiddlewares(
  ms: Middleware[],
  req: any
): Promise<string | void> {
  for (let m of ms) {
    const flag = await runMiddleware(m, req);
    if (flag) {
      return flag;
    }
  }
}
async function runMiddleware(m: Middleware, req: any) {
  if (isPathHandler(m)) {
    if (m.pattern === req.url) {
      const flag = await m.handle(req);
      return flag || "done";
    }
  } else {
    return m(req);
  }
}
function isPathHandler(m: Middleware): m is PathHandler {
  return typeof m !== "function";
}
export function static_(dir: string): Middleware {
  return async req => {
    const extname = path.extname(req.url);
    const contentType = getType(extname.slice(1));
    const filePath = path.join(dir, req.url.slice(1));
    const body = await stat(filePath)
      .then(fileInfo => {
        if (!fileInfo.isFile()) {
          return null;
        }
        return readFile(filePath);
      })
      .catch(e => {
        if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
          return null;
        }
        throw e;
      });
    if (!body) {
      return;
    }
    const headers = new Headers();
    headers.append("Content-Type", contentType);
    headers.append("Content-Length", body.byteLength.toString());
    await req.respond({ status: 200, headers, body });
    return "done";
  };
}
export function bodyParser(): Middleware {
  return async req => {
    if (req.headers.get("content-type") === "application/json") {
      try {
        req.data = JSON.parse(req.body);
      } catch (e) {
        req.error = e;
        return "400";
      }
    }
  };
}
export function get(
  pattern,
  handle: (req: any) => Promise<string | void>
): PathHandler {
  return { method: "GET", pattern, handle };
}
export function post(
  pattern,
  handle: (req: any) => Promise<string | void>
): PathHandler {
  return { method: "POST", pattern, handle };
}
export async function html(req, html: string) {
  const body = new TextEncoder().encode(html);
  const headers = new Headers();
  headers.append("Content-Type", "text/html");
  headers.append("Content-Length", body.byteLength.toString());
  await req.respond({ status: 200, headers, body });
}
export async function empty(req, status: number) {
  const body = new TextEncoder().encode("");
  const headers = new Headers();
  headers.append("Content-Type", "text/plain");
  headers.append("Content-Length", "0");
  await req.respond({ status, headers, body });
}
export async function file(req, filePath, contentType) {
  const body = await readFile(filePath);
  const headers = new Headers();
  headers.append("Content-Type", contentType);
  headers.append("Content-Length", body.byteLength.toString());
  await req.respond({ status: 200, headers, body });
}
