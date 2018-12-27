import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";
import { _parseURL } from "index.ts";
import { getType } from "mime.ts";

test(function parse_url() {
  const req: any = {
    url: "/files-tmb/1234/abc.png?key=val"
  };
  _parseURL(req);
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
