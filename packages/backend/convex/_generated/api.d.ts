/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agentAuthoring from "../agentAuthoring.js";
import type * as agentHttp from "../agentHttp.js";
import type * as agentImportHttp from "../agentImportHttp.js";
import type * as agentImports from "../agentImports.js";
import type * as agents from "../agents.js";
import type * as auth from "../auth.js";
import type * as cram from "../cram.js";
import type * as crons from "../crons.js";
import type * as deckSlugs from "../deckSlugs.js";
import type * as decks from "../decks.js";
import type * as deletion from "../deletion.js";
import type * as exportBuilder from "../exportBuilder.js";
import type * as exports from "../exports.js";
import type * as flashcards from "../flashcards.js";
import type * as functions from "../functions.js";
import type * as graph from "../graph.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as maintenance from "../maintenance.js";
import type * as mcp from "../mcp.js";
import type * as media from "../media.js";
import type * as mediaVariants from "../mediaVariants.js";
import type * as model_access from "../model/access.js";
import type * as model_agentAuth from "../model/agentAuth.js";
import type * as model_agentImportTools from "../model/agentImportTools.js";
import type * as model_agentTools from "../model/agentTools.js";
import type * as model_agentWrites from "../model/agentWrites.js";
import type * as model_cram from "../model/cram.js";
import type * as model_deckSizes from "../model/deckSizes.js";
import type * as model_decks from "../model/decks.js";
import type * as model_deletion from "../model/deletion.js";
import type * as model_email from "../model/email.js";
import type * as model_errors from "../model/errors.js";
import type * as model_flashcards from "../model/flashcards.js";
import type * as model_limits from "../model/limits.js";
import type * as model_performance from "../model/performance.js";
import type * as model_prereqs from "../model/prereqs.js";
import type * as model_publicTypes from "../model/publicTypes.js";
import type * as model_queue from "../model/queue.js";
import type * as model_reviewer from "../model/reviewer.js";
import type * as model_study from "../model/study.js";
import type * as model_summaries from "../model/summaries.js";
import type * as model_usage from "../model/usage.js";
import type * as performance from "../performance.js";
import type * as review from "../review.js";
import type * as reviewer from "../reviewer.js";
import type * as settings from "../settings.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agentAuthoring: typeof agentAuthoring;
  agentHttp: typeof agentHttp;
  agentImportHttp: typeof agentImportHttp;
  agentImports: typeof agentImports;
  agents: typeof agents;
  auth: typeof auth;
  cram: typeof cram;
  crons: typeof crons;
  deckSlugs: typeof deckSlugs;
  decks: typeof decks;
  deletion: typeof deletion;
  exportBuilder: typeof exportBuilder;
  exports: typeof exports;
  flashcards: typeof flashcards;
  functions: typeof functions;
  graph: typeof graph;
  http: typeof http;
  imports: typeof imports;
  maintenance: typeof maintenance;
  mcp: typeof mcp;
  media: typeof media;
  mediaVariants: typeof mediaVariants;
  "model/access": typeof model_access;
  "model/agentAuth": typeof model_agentAuth;
  "model/agentImportTools": typeof model_agentImportTools;
  "model/agentTools": typeof model_agentTools;
  "model/agentWrites": typeof model_agentWrites;
  "model/cram": typeof model_cram;
  "model/deckSizes": typeof model_deckSizes;
  "model/decks": typeof model_decks;
  "model/deletion": typeof model_deletion;
  "model/email": typeof model_email;
  "model/errors": typeof model_errors;
  "model/flashcards": typeof model_flashcards;
  "model/limits": typeof model_limits;
  "model/performance": typeof model_performance;
  "model/prereqs": typeof model_prereqs;
  "model/publicTypes": typeof model_publicTypes;
  "model/queue": typeof model_queue;
  "model/reviewer": typeof model_reviewer;
  "model/study": typeof model_study;
  "model/summaries": typeof model_summaries;
  "model/usage": typeof model_usage;
  performance: typeof performance;
  review: typeof review;
  reviewer: typeof reviewer;
  settings: typeof settings;
  stats: typeof stats;
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
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  mcp: import("@convex-dev/mcp/_generated/component.js").ComponentApi<"mcp">;
};
