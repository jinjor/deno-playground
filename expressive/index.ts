import { stat, readFile, DenoError, ErrorKind } from "deno";
import { getType } from "mime.ts";
import { path, http } from "package.ts";

type Method = "HEAD" | "OPTIONS" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Handle<T> = (req: Request, res: Response) => Promise<T>;
type Middleware = (Handle<Return>) | PathHandler;

export interface PathHandler {
  method: Method;
  pattern: string;
  handle: Handle<Return>;
}
type Return = string | void;
interface EventHandlers {
  [key: string]: Handle<Return>;
}

const defaultEventHandlers: EventHandlers = {
  done: async (req, res) => {},
  errorThrown: async (req, res) => {
    await res.empty(500);
  },
  middlewareNotMatched: async (req, res) => {
    await res.empty(404);
  },
  fileNotFound: async (req, res) => {
    await res.empty(404);
  },
  bodyNotJson: async (req, res) => {
    await res.empty(400);
  }
};

export class App {
  middlewares: Middleware[] = [];
  eventHandlers = defaultEventHandlers;
  constructor() {}
  use(m: Middleware) {
    this.middlewares.push(m);
  }
  on(event: string, f: any) {
    this.eventHandlers[event] = f;
  }
  listen(port: number, host?: string) {
    const serve = intercept(http.serve, this.middlewares, this.eventHandlers);
    serve(`${host || "127.0.0.1"}:${port}`);
  }
  get(pattern, handle: Handle<Return>): void {
    this.middlewares.push({ method: "GET", pattern, handle });
  }
  post(pattern, handle: Handle<Return>): void {
    this.middlewares.push({ method: "POST", pattern, handle });
  }
  put(pattern, handle: Handle<Return>): void {
    this.middlewares.push({ method: "PUT", pattern, handle });
  }
  patch(pattern, handle: Handle<Return>): void {
    this.middlewares.push({ method: "PATCH", pattern, handle });
  }
  delete(pattern, handle: Handle<Return>): void {
    this.middlewares.push({ method: "DELETE", pattern, handle });
  }
}

export class Request {
  method: Method;
  url: string;
  path: string;
  search: string;
  query: { [key: string]: string | string[] };
  params: { [key: string]: string };
  headers: Headers;
  body: Uint8Array;
  data: any;
  error?: Error;
  context: { [key: string]: any };
  constructor(public raw) {
    this.method = raw.method;
    this.url = raw.url;
    this.headers = raw.headers;
    this.body = raw.body;
    const url = new URL("http://a.b" + raw.url);
    this.path = url.pathname;
    this.search = url.search;
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
    this.query = query;
    this.context = {};
  }
}

class Response {
  private req;
  _state = "init";
  _status;
  _headers;
  _body;
  constructor(req: any) {
    this.req = req;
  }
  writeStatus(status: number) {
    if (this._state !== "init") {
      throw new Error("incorrect response order");
    }
    this._status = status;
    this._state = "status_done";
  }
  writeHeaders(headers: Headers) {
    if (this._state !== "status_done") {
      throw new Error("incorrect response order");
    }
    this._headers = headers;
    this._state = "headers_done";
  }
  writeBody(body: Uint8Array) {
    if (this._state !== "headers_done") {
      throw new Error("incorrect response order");
    }
    this._body = body;
  }
  end(): Promise<void> {
    if (this._state !== "headers_done") {
      throw new Error("incorrect response order");
    }
    this._state = "end";
    return this.req.respond({
      status: this._status,
      headers: this._headers,
      body: this._body
    });
  }
  send(
    status: number,
    headers: Headers,
    body: string | Uint8Array
  ): Promise<void> {
    if (typeof body === "string") {
      body = new TextEncoder().encode(body);
      if (headers.get("Content-Type") === undefined) {
        headers.append("Content-Type", "text/plain");
      }
    } else {
      if (headers.get("Content-Type") === undefined) {
        headers.append("Content-Type", "application/octet-stream");
      }
    }
    if (headers.get("Content-Length") === undefined) {
      headers.append("Content-Length", body.byteLength.toString());
    }
    this.writeStatus(status);
    this.writeHeaders(headers);
    this.writeBody(body);
    return this.end();
  }
  empty(status: number): Promise<void> {
    return this.send(status, new Headers(), "");
  }
  json(json: any): Promise<void> {
    return this.send(200, new Headers(), JSON.stringify(json));
  }
  async file(filePath: string, transform?: Function): Promise<boolean> {
    const notModified = false;
    if (notModified) {
      await this.empty(304);
      return true;
    }
    const extname = path.extname(filePath);
    const contentType = getType(extname.slice(1));
    let body = await stat(filePath)
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
      return false;
    }
    if (transform) {
      body = transform(body);
    }
    const headers = new Headers();
    headers.append("Content-Type", contentType);
    await this.send(200, headers, body);
    return true;
  }
}

function intercept(
  serve_,
  middlewares: Middleware[],
  eventHandlers: EventHandlers
) {
  return async function serve(...args) {
    const s = serve_.apply(null, args);
    for await (const raw of s) {
      const req = new Request(raw);
      await handleRequest(req, middlewares, eventHandlers);
    }
  };
}

async function handleRequest(
  req: Request,
  middlewares: Middleware[],
  eventHandlers: EventHandlers
) {
  const res = new Response(req.raw);
  let event: Return;
  try {
    event = await runMiddlewares(middlewares, req, res);
    event = event || "middlewareNotMatched";
  } catch (e) {
    req.error = e;
    if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
      event = "fileNotFound";
    } else {
      event = "errorThrown";
    }
  }
  const f = eventHandlers[event];
  if (f) {
    f(req, res);
  }
}
async function runMiddlewares(
  ms: Middleware[],
  req: Request,
  res: Response
): Promise<Return> {
  for (let m of ms) {
    const flag = await runMiddleware(m, req, res);
    if (flag) {
      return flag;
    }
  }
}
async function runMiddleware(
  m: Middleware,
  req: Request,
  res: Response
): Promise<Return> {
  if (isPathHandler(m)) {
    if (m.pattern === req.url) {
      req.context.matchedPattern = m.pattern;
      const flag = await m.handle(req, res);
      return flag || "done";
    }
  } else {
    return m(req, res);
  }
}
function isPathHandler(m: Middleware): m is PathHandler {
  return typeof m !== "function";
}
export function static_(dir: string): Middleware {
  return async (req, res) => {
    const filePath = path.join(dir, req.url.slice(1) || "index.html");
    const hit = await res.file(filePath);
    if (hit) {
      return "done";
    }
  };
}
export const bodyParser = {
  json: function bodyParser(): Middleware {
    return async (req, res) => {
      if (req.headers.get("Content-Type") === "application/json") {
        try {
          req.data = JSON.parse(new TextDecoder().decode(req.body));
        } catch (e) {
          req.error = e;
          return "bodyNotJson";
        }
      }
    };
  }
};
