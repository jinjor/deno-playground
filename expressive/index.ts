import { stat, readFile, DenoError, ErrorKind } from "deno";
import { getType } from "mime.ts";
import { path, http } from "package.ts";

type Method = "HEAD" | "OPTIONS" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Middleware = ((req: any, res: Response) => Promise<Return>) | PathHandler;
export interface PathHandler {
  method: Method;
  pattern: string;
  handle(req: any, res: Response): Promise<Return>;
}
type Return = ExpressiveEvent | void;
interface ExpressiveEvent {
  key: string;
  value?: any;
}
class Done implements ExpressiveEvent {
  key = "done";
}
class ErrorThrown implements ExpressiveEvent {
  key = "errorThrown";
  constructor(public value: Error) {}
}
class MiddlewareNotMatched implements ExpressiveEvent {
  key = "middlewareNotMatched";
}
class FileNotFound implements ExpressiveEvent {
  key = "fileNotFound";
  constructor(public value: Error) {}
}
class BodyIsNotJson implements ExpressiveEvent {
  key = "bodyIsNotJson";
  constructor(public value: Error) {}
}

const defaultEventHandlers = {
  errorThrown: async (req, res) => {
    await res.empty(400);
  },
  middlewareNotMatched: async (req, res) => {
    await res.empty(404);
  },
  fileNotFound: async (req, res) => {
    await res.empty(404);
  },
  bodyIsNotJson: async (req, res) => {
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
  get(pattern, handle: (req: any, res: Response) => Promise<Return>): void {
    this.middlewares.push({ method: "GET", pattern, handle });
  }
  post(pattern, handle: (req: any, res: Response) => Promise<Return>): void {
    this.middlewares.push({ method: "POST", pattern, handle });
  }
  put(pattern, handle: (req: any, res: Response) => Promise<Return>): void {
    this.middlewares.push({ method: "PUT", pattern, handle });
  }
  patch(pattern, handle: (req: any, res: Response) => Promise<Return>): void {
    this.middlewares.push({ method: "PATCH", pattern, handle });
  }
  delete(
    pattern,
    handle: (req: any, res: Response) => Promise<ExpressiveEvent>
  ): void {
    this.middlewares.push({ method: "DELETE", pattern, handle });
  }
}

class Response {
  private req;
  _state = "preparing";
  _status = 200;
  _headers = new Headers();
  _body = new Uint8Array(0);
  constructor(req) {
    this.req = req;
  }
  status(status: number) {
    this._status = status;
    this._state = "sent_status";
  }
  headers(headers: Headers) {
    if (this._state !== "sent_status") {
      throw new Error("incorrect response order");
    }
    this._headers = headers;
    this._state = "sent_headers";
  }
  body(body: Uint8Array) {
    if (this._state !== "sent_headers") {
      throw new Error("incorrect response order");
    }
    this._body = body;
  }
  end(): Promise<void> {
    if (this._state !== "sent_headers") {
      throw new Error("incorrect response order");
    }
    this._state = "end";
    return this.req.respond({
      status: this._status,
      headers: this._headers,
      body: this._body
    });
  }
  async empty(status: number): Promise<void> {
    const body = new TextEncoder().encode("");
    const headers = new Headers();
    headers.append("Content-Type", "text/plain");
    headers.append("Content-Length", "0");
    this.status(status);
    this.headers(headers);
    this.body(body);
    await this.end();
  }
  async json(json: any): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(json));
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    headers.append("Content-Length", body.byteLength.toString());
    this.status(200);
    this.headers(headers);
    this.body(body);
    await this.end();
  }
  async file(filePath: string, transform?: Function): Promise<void> {
    const notModified = false;
    if (notModified) {
      return this.empty(304);
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
      return;
    }
    if (transform) {
      body = transform(body);
    }
    const headers = new Headers();
    headers.append("Content-Type", contentType);
    headers.append("Content-Length", body.byteLength.toString());
    this.status(200);
    this.headers(headers);
    this.body(body);
    await this.end();
  }
}

function intercept(
  serve_,
  middlewares: Middleware[],
  special: { [key: string]: any }
) {
  return async function serve(...args) {
    const s = serve_.apply(null, args);
    for await (const raw of s) {
      const req = { raw, ...raw };
      const res = new Response(req);
      _parseURL(req);
      let event: Return;
      try {
        event = await runMiddlewares(middlewares, req, res);
        event = event || new MiddlewareNotMatched();
      } catch (e) {
        if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
          event = new FileNotFound(e);
        } else {
          event = new ErrorThrown(e);
        }
      }
      const f = special[event.key];
      if (f) {
        f(req, res, event.value);
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
  req: any,
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
  req: any,
  res: Response
): Promise<Return> {
  if (isPathHandler(m)) {
    if (m.pattern === req.url) {
      const flag = await m.handle(req, res);
      return flag || new Done();
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
    const filePath = path.join(dir, req.url.slice(1));
    return res.file(filePath);
  };
}
export function bodyParser(): Middleware {
  return async (req, res) => {
    if (req.headers.get("Content-Type") === "application/json") {
      try {
        req.data = JSON.parse(req.body);
      } catch (e) {
        return new BodyIsNotJson(e);
      }
    }
  };
}
