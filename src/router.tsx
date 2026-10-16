import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

/**
 * Query strings stay plain text both ways ("?place=72097", never JSON-quoted
 * or JSON-parsed): the pages read only a few known ids from them (see
 * src/lib/locale-url.ts), and a link's address is the address it lands on.
 */
const parseSearch = (search: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(search));
const stringifySearch = (search: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    if (typeof value === "string" || typeof value === "number") params.set(key, String(value));
  const query = params.toString();
  return query ? `?${query}` : "";
};

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    // /en/ is the English address and must not be rewritten to /en; /EN/ is not English.
    trailingSlash: "preserve",
    caseSensitive: true,
    parseSearch,
    stringifySearch,
  });
}
