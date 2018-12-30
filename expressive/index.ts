import { stat, open, DenoError, ErrorKind, close, Reader } from "deno";
import { getType } from "mime.ts";
import { path, http, color } from "package.ts";
import { transformAllString } from "io-util.ts";

type Method = "HEAD" | "OPTIONS" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Next = () => Promise<void>;
type Handler = (req: Request, next: Next) => Promise<void>;
type Middleware = Handler | PathHandler;
type PathMatcher = (pattern: string) => (path: string) => any;

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
  handle: Function;
}
interface EventHandlers {
  [key: string]: (req: Request) => Promise<void>;
}

const defaultEventHandlers: EventHandlers = {
  unexpectedError: async req => {
    await req.empty(500);
  }
};

export class App {
  middlewares: Middleware[] = [
    async (req, next) => {
      let unexpectedError = false;
      try {
        await next();
      } catch (e) {
        req.error = e;
        unexpectedError = true;
      }
      if (req.error) {
        if (unexpectedError) {
          await this.eventHandlers.unexpectedError(req);
        } else {
          await req.empty(req.response.status || 500);
        }
      }
    }
  ];
  eventHandlers = defaultEventHandlers;
  constructor() {}
  use(m: Middleware) {
    this.middlewares.push(m);
  }
  on(event: string, f: any) {
    this.eventHandlers[event] = f;
  }
  listen(port: number, host, callback?) {
    callback = typeof host === "function" ? host : callback || function() {};
    host = typeof host === "string" ? host : "127.0.0.1";
    const s = http.serve(`${host}:${port}`);
    (async () => {
      callback(port);
      for await (const raw of s) {
        const req = new Request(raw);
        await runMiddlewares(this.middlewares, req);
      }
    })();
    return {
      close() {
        throw new Error("cannot close for now");
      }
    };
  }
  private addPathHandler(method: Method, pattern: string, handle: Function) {
    this.middlewares.push({
      method,
      pattern,
      match: simplePathMatcher(pattern),
      handle
    });
  }
  get(pattern, handle: Function): void {
    this.addPathHandler("GET", pattern, handle);
  }
  post(pattern, handle: Function): void {
    this.addPathHandler("POST", pattern, handle);
  }
  put(pattern, handle: Function): void {
    this.addPathHandler("PUT", pattern, handle);
  }
  patch(pattern, handle: Function): void {
    this.addPathHandler("PATCH", pattern, handle);
  }
  delete(pattern, handle: Function): void {
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
  query: { [key: string]: string | string[] };
  params: { [key: string]: string };
  data: any;
  response: http.Response;
  error?: Error;
  context: { [key: string]: any };
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
    this.context = {};
  }
  async send(
    status: number,
    headers: Headers,
    body: string | Uint8Array | Reader
  ): Promise<void> {
    if (typeof body === "string") {
      body = new TextEncoder().encode(body);
      if (!headers.has("Content-Type")) {
        headers.append("Content-Type", "text/plain");
      }
    }
    this.response = { status, headers, body };
    await this.raw.respond(this.response);
  }
  async empty(status: number): Promise<void> {
    await this.send(status, new Headers(), "");
  }
  async json(json: any): Promise<void> {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    await this.send(200, headers, JSON.stringify(json));
  }
  async file(
    filePath: string,
    transform?: (src: string) => string
  ): Promise<void> {
    const notModified = false;
    if (notModified) {
      return this.empty(304);
    }
    const extname = path.extname(filePath);
    const contentType = getType(extname.slice(1));
    let file;
    try {
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile()) {
        return;
      }
      const headers = new Headers();
      headers.append("Content-Type", contentType);
      let body: Reader = await open(filePath);
      if (transform) {
        body = transformAllString(transform)(body);
      }
      await this.send(200, headers, body);
    } finally {
      if (file) {
        close(file.rid);
      }
    }
  }
}

async function runMiddlewares(ms: Middleware[], req: Request): Promise<void> {
  if (ms.length) {
    const [m, ...rest] = ms;
    await runMiddleware(m, req, () => {
      return runMiddlewares(rest, req);
    });
  }
}
async function runMiddleware(
  m: Middleware,
  req: Request,
  next: Next
): Promise<void> {
  if (isPathHandler(m)) {
    if (m.method !== req.method) {
      next();
    } else {
      const params = m.match(req.url);
      if (params) {
        req.context.matchedPattern = m.pattern;
        req.params = params;
        await m.handle(req);
      } else {
        next();
      }
    }
  } else {
    await m(req, next);
  }
}
function isPathHandler(m: Middleware): m is PathHandler {
  return typeof m !== "function";
}
export function static_(dir: string): Middleware {
  return async (req, next) => {
    const filePath = path.join(dir, req.url.slice(1) || "index.html");
    try {
      await req.file(filePath);
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
    return async (req, next) => {
      if (req.headers.get("Content-Type") === "application/json") {
        try {
          const body = await req.body();
          const text = new TextDecoder().decode(body);
          req.data = JSON.parse(text);
          console.log(req.data);
        } catch (e) {
          req.response.status = 400;
          req.error = e;
          return;
        }
      }
      await next();
    };
  },
  urlencoded(): Middleware {
    return async (req, next) => {
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
          req.response.status = 400;
          req.error = e;
          return;
        }
      }
      await next();
    };
  }
};
export function simpleLog(): Handler {
  return async (req, next) => {
    await next();
    const res = req.response;
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
