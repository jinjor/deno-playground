import { stat, readFile, DenoError, ErrorKind } from "deno";
import { getType } from "mime.ts";
import { path } from "package.ts";

type Middleware = (req: any) => Promise<string | void>;
export interface PathHandler {
  match(req: any): boolean;
  handle(req: any): Promise<string | void>;
}

export function intercept(
  serve_,
  middlewares: Middleware[],
  special: { [key: string]: any }
) {
  return async function serve(...args) {
    const s = serve_.apply(null, args);
    const context: any = {};
    for await (const req of s) {
      let flag = null;
      try {
        for (let m of middlewares) {
          flag = await m(req);
          if (flag) {
            break;
          }
        }
        flag = flag || "404";
      } catch (e) {
        context.error = e;
        if (e instanceof DenoError && e.kind === ErrorKind.NotFound) {
          flag = "404";
        } else {
          flag = "500";
        }
      }
      if (flag) {
        const f = special[flag];
        if (f) {
          f(req, context);
        }
      }
    }
  };
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
export function route(paths: PathHandler[]): Middleware {
  return async req => {
    for (let p of paths) {
      if (p.match(req)) {
        const flag = await p.handle(req);
        return flag || "done";
      }
    }
  };
}
function method(
  method_,
  head,
  handle: (req: any) => Promise<void>
): PathHandler {
  return {
    match(req) {
      return req.method == method_ && req.url === head;
    },
    handle(req) {
      return handle(req);
    }
  };
}
export function get(head, handle: (req: any) => Promise<void>): PathHandler {
  return method("GET", head, handle);
}
export function post(head, handle: (req: any) => Promise<void>): PathHandler {
  return method("POST", head, handle);
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
