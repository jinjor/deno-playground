import {
  stat,
  open,
  resources,
  DenoError,
  ErrorKind,
  close,
  Reader
} from "deno";
import { getType } from "mime.ts";
import { path, http, color } from "package.ts";
import { transformAllString, closeOnEOF } from "io-util.ts";

type Method = "HEAD" | "OPTIONS" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Next = () => Promise<void>;
type Handler = (req: Request, res: Response, next: Next) => Promise<void>;
type EndHandler = (req: Request, res: Response) => Promise<void>;
type Middleware = Handler | PathHandler;
type Query = { [key: string]: string | string[] };
type Params = { [key: string]: string };
type PathMatcher = (pattern: string) => (path: string) => Params;

export const simplePathMatcher: PathMatcher = _pattern => {
  const pattern = _pattern.split("/");
  const names = new Set();
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p[0] === "{" && p[p.length - 1] === "}") {
      const name = p.slice(1, -1).trim();
      if (!name) {
        throw new Error("invalid param name");
      }
      if (names.has(name)) {
        throw new Error("duplicated param name");
      }
      names.add(name);
    } else if (!p.trim() && i > 0 && i < pattern.length - 1) {
      throw new Error("invalid path segment");
    }
  }
  return _path => {
    const path = _path.split("/");
    if (pattern.length !== path.length) {
      return null;
    }
    const params = {};
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      if (p[0] === "{" && p[p.length - 1] === "}") {
        const name = p.slice(1, -1).trim();
        params[name] = path[i];
      } else if (p !== path[i]) {
        return null;
      }
    }
    return params;
  };
};

export interface PathHandler {
  method: Method;
  pattern: string;
  match: (path: string) => any;
  handle: EndHandler;
}
interface EventHandlers {
  [key: string]: EndHandler;
}

const defaultEventHandlers: EventHandlers = {
  unexpectedError: async (req, res) => {
    await res.empty(500);
  }
};

export class App {
  middlewares: Middleware[] = [];
  eventHandlers = defaultEventHandlers;
  use(m: Middleware) {
    this.middlewares.push(m);
  }
  on(event: string, f: any) {
    this.eventHandlers[event] = f;
  }
  async listen(port: number, host = "127.0.0.1") {
    const s = http.serve(`${host}:${port}`);
    (async () => {
      for await (const httpRequest of s) {
        const req = new Request(httpRequest);
        const res = new Response();
        let unexpectedError = false;
        try {
          await runMiddlewares(this.middlewares, req, res);
        } catch (e) {
          req.error = e;
          unexpectedError = true;
        }
        if (req.error) {
          if (unexpectedError) {
            await this.eventHandlers.unexpectedError(req, res);
          } else {
            if (!res.status) {
              res.status = 500;
            }
          }
        }
        await httpRequest.respond(res.toHttpResponse());
      }
    })();
    return {
      port,
      close() {
        throw new Error("cannot close for now");
      }
    };
  }
  private addPathHandler(method: Method, pattern: string, handle: EndHandler) {
    this.middlewares.push({
      method,
      pattern,
      match: simplePathMatcher(pattern),
      handle
    });
  }
  get(pattern, handle: EndHandler): void {
    this.addPathHandler("GET", pattern, handle);
  }
  post(pattern, handle: EndHandler): void {
    this.addPathHandler("POST", pattern, handle);
  }
  put(pattern, handle: EndHandler): void {
    this.addPathHandler("PUT", pattern, handle);
  }
  patch(pattern, handle: EndHandler): void {
    this.addPathHandler("PATCH", pattern, handle);
  }
  delete(pattern, handle: EndHandler): void {
    this.addPathHandler("DELETE", pattern, handle);
  }
}

export class Request {
  get method(): Method {
    return this.raw.method;
  }
  get url(): string {
    return this.raw.url;
  }
  get headers(): Headers {
    return this.raw.headers;
  }
  get body(): () => Promise<Uint8Array> {
    return this.raw.body.bind(this.raw);
  }
  path: string;
  search: string;
  query: Query;
  params: Params;
  data: any;
  error?: Error;
  extra: any = {};
  constructor(public raw) {
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
  }
}

class Response {
  status = 200;
  headers = new Headers();
  body?: string | Uint8Array | Reader;
  toHttpResponse(): http.Response {
    let { status = 200, headers, body = new Uint8Array() } = this;
    if (typeof body === "string") {
      body = new TextEncoder().encode(body);
      if (!headers.has("Content-Type")) {
        headers.append("Content-Type", "text/plain");
      }
    }
    return { status, headers, body };
  }
  async empty(status: number): Promise<void> {
    this.status = status;
  }
  async json(json: any): Promise<void> {
    this.headers.append("Content-Type", "application/json");
    this.body = JSON.stringify(json);
  }
  async file(
    filePath: string,
    transform?: (src: string) => string
  ): Promise<void> {
    const notModified = false;
    if (notModified) {
      this.status = 304;
      return;
    }
    const extname = path.extname(filePath);
    const contentType = getType(extname.slice(1));
    let file;
    try {
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile()) {
        return;
      }
      this.headers.append("Content-Type", contentType);
      file = await open(filePath);
      // turn on to check leak;
      // console.log(await resources());
      let body: Reader = closeOnEOF(file);
      if (transform) {
        body = transformAllString(transform)(body);
      }
      this.status = 200;
      this.body = body;
    } catch (e) {
      if (file) {
        file.close();
      }
      throw e;
    }
  }
}

async function runMiddlewares(
  ms: Middleware[],
  req: Request,
  res: Response
): Promise<void> {
  if (ms.length) {
    const [m, ...rest] = ms;
    await runMiddleware(m, req, res, () => {
      return runMiddlewares(rest, req, res);
    });
  }
}
async function runMiddleware(
  m: Middleware,
  req: Request,
  res: Response,
  next: Next
): Promise<void> {
  if (isPathHandler(m)) {
    if (m.method !== req.method) {
      next();
    } else {
      const params = m.match(req.url);
      if (params) {
        req.extra.matchedPattern = m.pattern;
        req.params = params;
        await m.handle(req, res);
      } else {
        next();
      }
    }
  } else {
    await m(req, res, next);
  }
}
function isPathHandler(m: Middleware): m is PathHandler {
  return typeof m !== "function";
}
export function static_(dir: string): Middleware {
  return async (req, res, next) => {
    const filePath = path.join(dir, req.url.slice(1) || "index.html");
    try {
      await res.file(filePath);
    } catch (e) {
      if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
        await next();
      } else {
        throw e;
      }
    }
  };
}
export const bodyParser = {
  json(): Middleware {
    return async (req, res, next) => {
      if (req.headers.get("Content-Type") === "application/json") {
        try {
          const body = await req.body();
          const text = new TextDecoder().decode(body);
          req.data = JSON.parse(text);
        } catch (e) {
          res.status = 400;
          req.error = e;
          return;
        }
      }
      await next();
    };
  },
  urlencoded(): Middleware {
    return async (req, res, next) => {
      if (
        req.headers.get("Content-Type") === "application/x-www-form-urlencoded"
      ) {
        try {
          const body = await req.body();
          const text = new TextDecoder().decode(body);
          const data = {};
          for (let s of text.split("&")) {
            const result = /^(.+?)=(.*)$/.exec(s);
            if (result.length < 3) {
              continue;
            }
            const key = decodeURIComponent(result[1].replace("+", " "));
            const value = decodeURIComponent(result[2].replace("+", " "));
            if (Array.isArray(data[key])) {
              data[key] = [...data[key], value];
            } else if (data[key]) {
              data[key] = [data[key], value];
            } else {
              data[key] = value;
            }
          }
          req.data = data;
        } catch (e) {
          res.status = 400;
          req.error = e;
          return;
        }
      }
      await next();
    };
  }
};
export function simpleLog(): Handler {
  return async (req, res, next) => {
    await next();
    if (!res) {
      console.log(req.method, req.url);
    } else if (res.status >= 500) {
      console.log(color.red(res.status + ""), req.method, req.url);
      if (req.error) {
        console.log(color.red(req.error + ""));
      }
    } else if (res.status >= 400) {
      console.log(color.yellow(res.status + ""), req.method, req.url);
    } else if (res.status >= 300) {
      console.log(color.cyan(res.status + ""), req.method, req.url);
    } else if (res.status >= 200) {
      console.log(color.green(res.status + ""), req.method, req.url);
    }
  };
}
