import { test, assertEqual } from "https://deno.land/x/testing/testing.ts";
import { _parseURL } from "index.ts";

test(function ParseURL() {
  const req: any = {
    url: "http://www.example.com/files-tmb/1234/abc.png?key=val"
  };
  _parseURL(req);
  assertEqual("http", req.protocol);
  assertEqual("www.example.com", req.host);
  assertEqual("/files-tmb/1234/abc.png", req.path);
  assertEqual("val", req.query.key);
});
