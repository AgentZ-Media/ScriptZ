/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as characterColors from "../characterColors.js";
import type * as clients from "../clients.js";
import type * as comments from "../comments.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as rbac from "../rbac.js";
import type * as scripts from "../scripts.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as status from "../status.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  characterColors: typeof characterColors;
  clients: typeof clients;
  comments: typeof comments;
  folders: typeof folders;
  http: typeof http;
  ideas: typeof ideas;
  rbac: typeof rbac;
  scripts: typeof scripts;
  search: typeof search;
  seed: typeof seed;
  status: typeof status;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
