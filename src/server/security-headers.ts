import { definePlugin } from "nitro";
import { SECURITY_HEADERS } from "../lib/security-headers";

// A Nitro runtime hook, not a route rule: route-rule headers are not added to
// non-2xx responses (404, 500), and those pages need the same headers.
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("response", (res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!res.headers.has(name)) res.headers.set(name, value);
    }
  });
});
