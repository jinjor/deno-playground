import { stat, readFile, open, DenoError, ErrorKind, close } from "deno";
import { getType } from "mime.ts";
import { path, http, color } from "package.ts";

type Method = "HEAD" | "OPTIONS" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Handle<T> = (req: Request) => Promise<T>;
type Middleware = (Handle<Return>) | PathHandler;
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
  handle: Handle<Return>;
}
type Return = string | void;
interface EventHandlers {
  [key: string]: Handle<Return>;
}

const defaultEventHandlers: EventHandlers = {
  errorThrown: async req => {
    await req.empty(500);
  },
  middlewareNotMatched: async req => {
    await req.empty(404);
  },
  fileNotFound: async req => {
    await req.empty(404);
  },
  bodyNotJson: async req => {
    await req.empty(400);
  },
  done: async req => {}
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
  listen(port: number, host, callback?) {
    callback = typeof host === "function" ? host : callback || function() {};
    host = typeof host === "string" ? host : "127.0.0.1";
    const s = http.serve(`${host}:${port}`);
    (async () => {
      callback(port);
      for await (const raw of s) {
        const req = new Request(raw);
        const body = await raw.body();
        req.body = body;
        await handleRequest(req, this.middlewares, this.eventHandlers);
      }
    })();
    return {
      close() {
        throw new Error("cannot close for now");
      }
    };
  }
  private addPathHandler(
    method: Method,
    pattern: string,
    handle: Handle<Return>
  ) {
    this.middlewares.push({
      method,
      pattern,
      match: simplePathMatcher(pattern),
      handle
    });
  }
  get(pattern, handle: Handle<Return>): void {
    this.addPathHandler("GET", pattern, handle);
  }
  post(pattern, handle: Handle<Return>): void {
    this.addPathHandler("POST", pattern, handle);
  }
  put(pattern, handle: Handle<Return>): void {
    this.addPathHandler("PUT", pattern, handle);
  }
  patch(pattern, handle: Handle<Return>): void {
    this.addPathHandler("PATCH", pattern, handle);
  }
  delete(pattern, handle: Handle<Return>): void {
    this.addPathHandler("DELETE", pattern, handle);
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
  response: http.Response;
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
  async send(
    status: number,
    headers: Headers,
    body: string | Uint8Array
  ): Promise<void> {
    if (typeof body === "string") {
      body = new TextEncoder().encode(body);
      if (!headers.has("Content-Type")) {
        headers.append("Content-Type", "text/plain");
      }
    } else {
      if (!headers.has("Content-Type")) {
        headers.append("Content-Type", "application/octet-stream");
      }
    }
    if (!headers.has("Content-Length")) {
      headers.append("Content-Length", body.byteLength.toString());
    }
    this.response = { status, headers, body };
    await this.raw.respond(this.response);
  }
  empty(status: number): Promise<void> {
    return this.send(status, new Headers(), "");
  }
  json(json: any): Promise<void> {
    return this.send(200, new Headers(), JSON.stringify(json));
  }
  async file(filePath: string, transform?: Function): Promise<void> {
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
      let body;
      if (transform) {
        let body = await readFile(filePath);
        body = transform(body);
      } else {
        body = await open(filePath);
      }
      await this.send(200, headers, body);
    } catch (e) {
      if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
        return;
      } else {
        throw e;
      }
    } finally {
      if (file) {
        close(file.rid);
      }
    }
  }
}

async function handleRequest(
  req: Request,
  middlewares: Middleware[],
  eventHandlers: EventHandlers
) {
  let event: Return;
  try {
    event = await runMiddlewares(middlewares, req);
    if (!req.response) {
      event = "middlewareNotMatched";
    }
  } catch (e) {
    req.error = e;
    if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
      event = "fileNotFound";
    } else {
      event = "errorThrown";
    }
  }
  if (event) {
    const f = eventHandlers[event];
    if (f) {
      await f(req);
    }
  }
  if (!req.response) {
    await eventHandlers.responseNotDone(req);
  }
  await eventHandlers.done(req);
}
async function runMiddlewares(ms: Middleware[], req: Request): Promise<Return> {
  for (let m of ms) {
    const flag = await runMiddleware(m, req);
    if (req.response) {
      return flag;
    }
  }
}
async function runMiddleware(m: Middleware, req: Request): Promise<Return> {
  if (isPathHandler(m)) {
    if (m.method !== req.method) {
      return;
    }
    const params = m.match(req.url);
    if (params) {
      req.context.matchedPattern = m.pattern;
      req.params = params;
      return m.handle(req);
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
    const filePath = path.join(dir, req.url.slice(1) || "index.html");
    return req.file(filePath);
  };
}
export const bodyParser = {
  json: function bodyParser(): Middleware {
    return async req => {
      if (req.headers.get("Content-Type") === "application/json") {
        try {
          const text = new TextDecoder().decode(req.body);
          req.data = JSON.parse(text);
        } catch (e) {
          req.error = e;
          return "bodyNotJson";
        }
      }
    };
  }
};
export function simpleLog(options = { verbose: false }): Handle<void> {
  return async req => {
    const res = req.response;
    if (!res.status) {
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
