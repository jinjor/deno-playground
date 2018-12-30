import {
  test,
  assert,
  assertEqual
} from "https://deno.land/x/testing/testing.ts";
import { Request, simplePathMatcher } from "index.ts";
import { getType } from "mime.ts";
import { throws } from "../assertion/assertion.ts";

import { stat, open, resources, close, Reader } from "deno";

test(async function closeTest() {
  let file;
  try {
    console.log(await resources());
    const file = await open("../README.md");
    console.log(await resources());
    await file.close();
    console.log(await resources());
  } finally {
    if (file) {
      await file.close();
    }
  }
});

test(function parse_url() {
  const req = new Request({
    url: "/files-tmb/1234/abc.png?key=val"
  });
  assertEqual(req.path, "/files-tmb/1234/abc.png");
  assertEqual(req.query.key, "val");
});

test(function mime() {
  assertEqual(getType("html"), "text/html");
  assertEqual(getType("css"), "text/css");
  assertEqual(getType("jpg"), "image/jpeg");
  assertEqual(getType("jpeg"), "image/jpeg");
  assertEqual(getType("png"), "image/png");
  assertEqual(getType("js"), "application/javascript");
  assertEqual(getType("json"), "application/json");
});

test(function pathMatcher() {
  assert(!!simplePathMatcher("/")("/"));
  assert(!!simplePathMatcher("/foo")("/foo"));
  assert(!!simplePathMatcher("/foo/")("/foo/"));
  assert(!!simplePathMatcher("/foo/1")("/foo/1"));
  assertEqual(simplePathMatcher("/foo")("/"), null);
  assertEqual(simplePathMatcher("/foo")("/fooo"), null);
  assertEqual(simplePathMatcher("/foo")("/foo/"), null);
  assertEqual(simplePathMatcher("/{a}")("/foo").a, "foo");
  assertEqual(simplePathMatcher("/{a}/foo/{xxx}")("/34/foo/1").a, "34");
  assertEqual(simplePathMatcher("/{a}/foo/{xxx}")("/34/foo/1").xxx, "1");
  for (let v of ["//", "/{}", "/{x}/{x}"]) {
    throws(() => {
      simplePathMatcher(v);
    });
  }
});
