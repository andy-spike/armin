import { customMutation } from "convex-helpers/server/customFunctions";
/* eslint-disable no-restricted-imports */
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
/* eslint-enable no-restricted-imports */
import { withSummaries } from "./model/summaries";

const summaries = {
  args: {},
  input: async (ctx: Parameters<typeof withSummaries>[0]) => {
    const { db, flush, batch } = withSummaries(ctx);
    return { ctx: { db, activityBatch: batch }, args: {}, onSuccess: flush };
  },
};

export const mutation = customMutation(rawMutation, summaries);
export const internalMutation = customMutation(rawInternalMutation, summaries);
