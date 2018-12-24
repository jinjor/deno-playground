import { readFile } from "deno";
import { getType } from "mime";
import * as path from "https://deno.land/x/path/index.ts";

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
      try {
        for (let m of middlewares) {
          flag = await m(req);
          if (flag) {
            break;
          }
        }
      } catch (e) {
        console.log(e);
        flag = "500";
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
export function static_(dir: string): Middleware {
  return async req => {
    const extname = path.extname(req.url);
    const contentType = getType(extname.slice(1));
    try {
      await file(req, path.join(dir, req.url.slice(1)), contentType);
      return "done";
    } catch (_) {}
  };
}
export function route(paths: PathHandler[]): Middleware {
  return async req => {
    for (let p of paths) {
      if (p.match(req)) {
        await p.handle(req);
        return "done";
      }
    }
    return "404";
  };
}
function method(method_, head, handle): PathHandler {
  return {
    match(req) {
      return req.method == method_ && req.url === head;
    },
    handle(req) {
      return handle(req);
    }
  };
}
export function get(head, f): PathHandler {
  return method("GET", head, f);
}
export function post(head, f): PathHandler {
  return method("POST", head, f);
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
  const body = await readFile(filename);
  const headers = new Headers();
  headers.append("Content-Type", contentType);
  headers.append("Content-Length", body.byteLength.toString());
  req.respond({ status: 200, headers, body });
}
