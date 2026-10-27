import { customMutation } from "convex-helpers/server/customFunctions";
// This file wraps the raw builders; everything else imports the wrapped ones.
/* eslint-disable no-restricted-imports */
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
/* eslint-enable no-restricted-imports */
import { withSummaries } from "./model/summaries";

/*
 * Every mutation is built here, never from `_generated/server`, so each write
 * keeps the derived Browse summaries and deck counters in step within the
 * same transaction (model/summaries.ts).
 */

const summaries = {
  args: {},
  input: async (ctx: Parameters<typeof withSummaries>[0]) => {
    const { db, flush } = withSummaries(ctx);
    return { ctx: { db }, args: {}, onSuccess: flush };
  },
};

export const mutation = customMutation(rawMutation, summaries);
export const internalMutation = customMutation(rawInternalMutation, summaries);
