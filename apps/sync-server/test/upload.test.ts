import { describe, expect, it } from "vitest";
import { card, newId, profile, settingsRecord, signIn } from "./helpers";

describe("initial Profile upload", () => {
  it("fills an empty Account once, and a retried completion is harmless", async () => {
    const device = await signIn();
    const { records } = profile();
    const uploadId = newId("upload");
    const { position } = await device.upload(records, uploadId);

    expect(await device.json(device.send("/profile"))).toEqual({
      status: "ready",
      position,
    });
    const retried = await device.json(
      device.send(`/profile/upload/${uploadId}/complete`, { method: "POST" }),
    );
    expect(retried).toEqual({ status: "ready", position });

    const again = await device.send("/profile/upload", {
      method: "POST",
      json: { uploadId: newId("upload") },
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      error: { code: "already_initialized" },
    });
  });

  it("an interrupted upload resumes, and a new upload discards what it staged", async () => {
    const device = await signIn();
    const { records } = profile();
    const stale = card("missing-deck", "Orphan");
    const first = newId("upload");
    await device.json(
      device.send("/profile/upload", {
        method: "POST",
        json: { uploadId: first },
      }),
    );
    await device.json(
      device.send(`/profile/upload/${first}/records`, {
        method: "PUT",
        json: { records: stale.records },
      }),
    );
    expect(await device.json(device.send("/profile"))).toEqual({
      status: "uploading",
      uploadId: first,
    });

    // Starting over with a new upload id drops the orphan staged above.
    const second = newId("upload");
    await device.json(
      device.send("/profile/upload", {
        method: "POST",
        json: { uploadId: second },
      }),
    );
    const superseded = await device.send(`/profile/upload/${first}/records`, {
      method: "PUT",
      json: { records },
    });
    expect(superseded.status).toBe(409);
    expect(await superseded.json()).toMatchObject({
      error: { code: "upload_superseded" },
    });

    // The second upload arrives in two chunks, the second one resent after a dropped response.
    for (const chunk of [
      records.slice(0, 3),
      records.slice(3),
      records.slice(3),
    ]) {
      await device.json(
        device.send(`/profile/upload/${second}/records`, {
          method: "PUT",
          json: { records: chunk },
        }),
      );
    }
    await device.json(
      device.send(`/profile/upload/${second}/complete`, { method: "POST" }),
    );
    const { records: pulled } = await device.pullAll();
    expect(pulled).toHaveLength(records.length);
    expect(pulled.every((r) => r.version === 1 && !r.deleted)).toBe(true);
  });

  it("refuses to publish a Profile that breaks relationship rules", async () => {
    const device = await signIn();
    const uploadId = newId("upload");
    const orphan = card("missing-deck");
    await device.json(
      device.send("/profile/upload", { method: "POST", json: { uploadId } }),
    );
    await device.json(
      device.send(`/profile/upload/${uploadId}/records`, {
        method: "PUT",
        json: { records: [settingsRecord(), ...orphan.records] },
      }),
    );
    const res = await device.send(`/profile/upload/${uploadId}/complete`, {
      method: "POST",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "integrity" } });
    expect(await device.json(device.send("/profile"))).toMatchObject({
      status: "uploading",
    });
  });

  it("a second device catches up through paginated pulls", async () => {
    const first = await signIn();
    const deckId = newId("deck");
    const cards = Array.from({ length: 30 }, (_, i) =>
      card(deckId, `Card ${i}`),
    );
    const records = [
      settingsRecord(),
      {
        kind: "deck" as const,
        id: deckId,
        data: { name: "Big", description: null, createdAt: 0, updatedAt: 0 },
      },
      ...cards.flatMap((c) => c.records),
    ];
    const { position } = await first.upload(records);

    const second = await signIn(first.userId);
    const pulled = await second.pullAll(undefined, 7);
    expect(pulled.records).toHaveLength(records.length);
    expect(new Set(pulled.records.map((r) => `${r.kind}:${r.id}`)).size).toBe(
      records.length,
    );
    expect(pulled.position).toBe(position);

    // Nothing new since the saved position.
    expect((await second.pullAll(pulled.position)).records).toEqual([]);
  });
});
