import { test, assert, assertEqual } from "https://deno.land/x/testing/mod.ts";
import { delay } from "cancelable.ts";

test(function CancerablePromise() {
  const p1 = delay(10000);
  p1.catch(_ => {
    assert(false);
  }).then(v => {
    assertEqual(v, 1);
  });
  const p2 = delay(10000);
  p2.then(_ => {
    assert(false);
  }).catch(e => {
    assertEqual(e, 2);
  });

  setTimeout(() => {
    p1.done(1 as any);
    p2.cancel(2);
  }, 1000);
});
