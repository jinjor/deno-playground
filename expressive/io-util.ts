import { Reader, ReadCloser, Buffer, toAsyncIterator } from "deno";

export function transformAllString(
  f: (src: string) => string
): (r: Reader) => Reader {
  return transformAll(b => {
    return new TextEncoder().encode(f(new TextDecoder().decode(b)));
  });
}

export function transformAll(
  f: (src: Uint8Array) => Uint8Array
): (r: Reader) => Reader {
  let targetBuf;
  return r => ({
    read: async (p: Uint8Array) => {
      if (!targetBuf) {
        const bytes = await readAll(r);
        targetBuf = new Buffer();
        targetBuf.write(f(bytes));
      }
      return targetBuf.read(p);
    }
  });
}

export function closeOnEOF(r: ReadCloser): ReadCloser {
  return {
    read: async (p: Uint8Array) => {
      const res = await r.read(p);
      if (res.eof) {
        r.close();
      }
      return res;
    },
    close() {
      r.close();
    }
  };
}

export function hookEOF(r: Reader, callback: () => void): Reader {
  return {
    read: async (p: Uint8Array) => {
      const res = await r.read(p);
      if (res.eof) {
        setTimeout(callback, 0);
      }
      return res;
    }
  };
}

export async function readAll(r: Reader): Promise<Uint8Array> {
  const buf = new Buffer();
  for await (const chunk of toAsyncIterator(r)) {
    await buf.write(chunk);
  }
  return buf.bytes();
}
