import {
  DEFAULT_PULL_LIMIT,
  MAX_PULL_LIMIT,
  pushRequestSchema,
  startUploadRequestSchema,
  SYNC_API_PREFIX,
  uploadRecordsRequestSchema,
} from "@armin/sync-contract";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { authenticatedAccountId, getAuth } from "./auth";
import { SyncError } from "./errors";
import { pushMutations } from "./sync/commit";
import { getMedia, putMedia } from "./sync/media";
import { pullChanges } from "./sync/pull";
import {
  completeUpload,
  getProfileStatus,
  stageRecords,
  startUpload,
} from "./sync/upload";

type App = { Bindings: Env; Variables: { accountId: string } };

async function parseBody<T extends z.ZodType>(c: Context, schema: T) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new SyncError(400, "invalid_request", "The body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new SyncError(400, "invalid_request", z.prettifyError(parsed.error));
  }
  return parsed.data as z.infer<T>;
}

const pullLimit = z.coerce.number().int().min(1).max(MAX_PULL_LIMIT);

const sync = new Hono<App>()
  .use(async (c, next) => {
    const accountId = await authenticatedAccountId(c.env, c.req.raw.headers);
    if (!accountId) {
      throw new SyncError(401, "unauthorized", "Sign in to sync.");
    }
    c.set("accountId", accountId);
    await next();
  })
  .get("/profile", async (c) =>
    c.json(await getProfileStatus(c.env.DB, c.var.accountId)),
  )
  .post("/profile/upload", async (c) => {
    const { uploadId } = await parseBody(c, startUploadRequestSchema);
    return c.json(await startUpload(c.env.DB, c.var.accountId, uploadId));
  })
  .put("/profile/upload/:uploadId/records", async (c) => {
    const { records } = await parseBody(c, uploadRecordsRequestSchema);
    return c.json(
      await stageRecords(
        c.env.DB,
        c.var.accountId,
        c.req.param("uploadId"),
        records,
      ),
    );
  })
  .post("/profile/upload/:uploadId/complete", async (c) =>
    c.json(
      await completeUpload(c.env.DB, c.var.accountId, c.req.param("uploadId")),
    ),
  )
  .post("/changes", async (c) => {
    const { mutations } = await parseBody(c, pushRequestSchema);
    return c.json(await pushMutations(c.env.DB, c.var.accountId, mutations));
  })
  .get("/changes", async (c) => {
    const limit = pullLimit.safeParse(
      c.req.query("limit") ?? DEFAULT_PULL_LIMIT,
    );
    if (!limit.success) {
      throw new SyncError(
        400,
        "invalid_request",
        `limit must be 1–${MAX_PULL_LIMIT}.`,
      );
    }
    return c.json(
      await pullChanges(
        c.env.DB,
        c.var.accountId,
        c.req.query("after"),
        limit.data,
      ),
    );
  })
  .put("/media/:fileName", async (c) =>
    c.json(
      await putMedia(
        c.env,
        c.var.accountId,
        c.req.param("fileName"),
        c.req.raw,
      ),
      201,
    ),
  )
  .get("/media/:fileName", (c) =>
    getMedia(c.env, c.var.accountId, c.req.param("fileName")),
  );

const app = new Hono<App>()
  .get("/health", (c) => c.json({ ok: true }))
  .on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw))
  .route(SYNC_API_PREFIX, sync);

app.onError((error, c) => {
  if (error instanceof SyncError) {
    return c.json(error.toResponseBody(), error.status);
  }
  console.error(error);
  return c.json(
    { error: { code: "internal", message: "Internal error." } },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "No such route." } }, 404),
);

export default app;
