import { readFile } from "deno";

type Middleware = any;
export interface PathHandler {
  match(req: any): boolean;
  handle(req: any): string;
}

export function intercept(
  serve_,
  middlewares: Middleware[],
  special: { [key: string]: any }
) {
  return async function serve(...args) {
    const s = serve_.apply(null, args);
    for await (const req of s) {
      let flag = null;
      for (let m of middlewares) {
        flag = await m(req);
      }
      if (flag) {
        const f = special[flag];
        if (f) {
          f(req);
        } else {
          throw new Error(`handler [${flag}] not defined`);
        }
      }
    }
  };
}
export function route(paths: PathHandler[]): Middleware {
  return async req => {
    for (let p of paths) {
      if (p.match(req)) {
        return await p.handle(req);
      }
    }
  };
}
function method(method_, head, f): PathHandler {
  return {
    match(req) {
      return req.method == method_ && req.url === head;
    },
    handle(req) {
      return f(req);
    }
  };
}
export function get(head, f): PathHandler {
  return method("GET", head, f);
}
export function html(req, html: string) {
  const body = new TextEncoder().encode(html);
  const headers = new Headers();
  headers.append("Content-Type", "text/html");
  headers.append("Content-Length", body.byteLength.toString());
  req.respond({ status: 200, headers, body });
}
export function empty(req, status: number) {
  const body = new TextEncoder().encode("");
  const headers = new Headers();
  headers.append("Content-Type", "text/plain");
  headers.append("Content-Length", "0");
  req.respond({ status, headers, body });
}
export async function file(req, filename, contentType) {
  const data = await readFile(filename);
  const decoder = new TextDecoder();
  const js = decoder.decode(data);
  const body = new TextEncoder().encode(js);
  const headers = new Headers();
  headers.append("Content-Type", contentType);
  headers.append("Content-Length", body.byteLength.toString());
  req.respond({ status: 200, headers, body });
}
