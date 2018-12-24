import * as flags from "https://deno.land/x/flags/index.ts";
import * as http from "https://deno.land/x/net/http.ts";
import * as expressive from "../expressive/index.ts";
import { platform } from "deno";
import * as o from "https://denopkg.com/hashrock/deno-opn/opn.ts";

export { flags, http, expressive };
export const opn =
  platform.os === "mac" || platform.os === "win" ? o.opn : function() {};
