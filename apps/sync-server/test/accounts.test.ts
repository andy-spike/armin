import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { profile, request, signIn } from "./helpers";

describe("Accounts and sessions", () => {
  it("refuses sync requests without a session", async () => {
    const res = await request("/v1/profile");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("refuses expired and revoked sessions", async () => {
    const expired = await signIn();
    const revoked = await signIn();
    await env.DB.prepare(
      `UPDATE "session" SET "expiresAt" = ?1 WHERE "token" = ?2`,
    )
      .bind(new Date(Date.now() - 60_000).toISOString(), expired.token)
      .run();
    await env.DB.prepare(`DELETE FROM "session" WHERE "token" = ?1`)
      .bind(revoked.token)
      .run();

    expect((await expired.send("/profile")).status).toBe(401);
    expect((await revoked.send("/profile")).status).toBe(401);
  });

  it("keeps each Account's Profile private", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await alice.upload(profile().records);

    expect(await bob.json(bob.send("/profile"))).toEqual({ status: "empty" });
    expect((await bob.send("/changes")).status).toBe(409);

    await bob.upload(profile().records);
    const alicesRecords = (await alice.pullAll()).records;
    const bobsRecords = (await bob.pullAll()).records;
    const aliceIds = new Set(alicesRecords.map((r) => `${r.kind}:${r.id}`));
    expect(
      bobsRecords.some(
        (r) => r.kind !== "settings" && aliceIds.has(`${r.kind}:${r.id}`),
      ),
    ).toBe(false);
  });
});
