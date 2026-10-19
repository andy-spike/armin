import { MAX_MEDIA_BYTES, parseMediaFileName } from "@armin/sync-contract";
import { SyncError } from "../errors";
import { getAccount } from "./db";

const objectKey = (accountId: string, fileName: string) =>
  `accounts/${accountId}/media/${fileName}`;

function parseName(fileName: string) {
  const parsed = parseMediaFileName(fileName);
  if (!parsed) {
    throw new SyncError(
      400,
      "invalid_request",
      `${fileName} is not a media file name.`,
    );
  }
  return parsed;
}

const tooLarge = () =>
  new SyncError(413, "media_too_large", "Media files are limited to 25 MiB.");

/** The request body, refused as soon as it passes the media size limit. */
async function readCapped(request: Request) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > MAX_MEDIA_BYTES) throw tooLarge();
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Store a media file in the Account's private space. Files are named by their
 * SHA-256, so the bytes must match the name, and re-uploading is harmless.
 */
export async function putMedia(
  env: Env,
  accountId: string,
  fileName: string,
  request: Request,
) {
  const { sha256, contentType } = parseName(fileName);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw tooLarge();
  if (!(await getAccount(env.DB, accountId))) {
    throw new SyncError(
      409,
      "not_initialized",
      "Start a Profile upload before uploading media.",
    );
  }

  const bytes = await readCapped(request);
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== sha256) {
    throw new SyncError(
      422,
      "media_hash_mismatch",
      "The bytes do not match the file name.",
    );
  }

  await env.MEDIA.put(objectKey(accountId, fileName), bytes, {
    httpMetadata: { contentType },
  });
  await env.DB.prepare(
    `INSERT INTO sync_media (account_id, file_name, byte_size, created_at)
     VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING`,
  )
    .bind(accountId, fileName, bytes.byteLength, Date.now())
    .run();
  return { fileName, byteSize: bytes.byteLength };
}

/** A media file the Account uploaded; other Accounts' files are not found. */
export async function getMedia(env: Env, accountId: string, fileName: string) {
  const { contentType } = parseName(fileName);
  const owned = await env.DB.prepare(
    "SELECT 1 FROM sync_media WHERE account_id = ?1 AND file_name = ?2",
  )
    .bind(accountId, fileName)
    .first();
  const object = owned
    ? await env.MEDIA.get(objectKey(accountId, fileName))
    : null;
  if (!object) throw new SyncError(404, "not_found", "Media not found.");
  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "content-length": String(object.size),
      "cache-control": "private, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  });
}
