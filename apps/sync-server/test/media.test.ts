import { describe, expect, it } from "vitest";
import { cardData, newId, profile, signIn, unitData } from "./helpers";

async function mediaFile(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { bytes, fileName: `${hash}.png` };
}

describe("media", () => {
  it("is private to the Account that uploaded it", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await alice.upload(profile().records);
    await bob.upload(profile().records);
    const { bytes, fileName } = await mediaFile("alice's image");

    const put = await alice.send(`/media/${fileName}`, {
      method: "PUT",
      body: bytes,
    });
    expect(put.status).toBe(201);

    const own = await alice.send(`/media/${fileName}`);
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(bytes);
    expect((await bob.send(`/media/${fileName}`)).status).toBe(404);
  });

  it("refuses bytes that do not match the file name", async () => {
    const device = await signIn();
    await device.upload(profile().records);
    const { fileName } = await mediaFile("expected");
    const res = await device.send(`/media/${fileName}`, {
      method: "PUT",
      body: new TextEncoder().encode("something else"),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { code: "media_hash_mismatch" },
    });
  });

  it("must be uploaded before Flashcard content refers to it", async () => {
    const device = await signIn();
    const { deckId, records } = profile();
    await device.upload(records);
    const { bytes, fileName } = await mediaFile("diagram");
    const cardId = newId("card");
    const content = JSON.stringify({
      front: `![](armin-media:${fileName})`,
      back: "Back",
    });
    const operations = [
      {
        op: "put" as const,
        kind: "flashcard" as const,
        id: cardId,
        baseVersion: null,
        data: cardData(deckId, "", content),
      },
      {
        op: "put" as const,
        kind: "review_unit" as const,
        id: newId("unit"),
        baseVersion: null,
        data: unitData(cardId),
      },
    ];

    const [missing] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations,
    });
    expect(missing).toMatchObject({
      status: "rejected",
      code: "missing_media",
    });

    await device.send(`/media/${fileName}`, { method: "PUT", body: bytes });
    const [accepted] = await device.push({
      type: "records",
      mutationId: newId("m"),
      operations,
    });
    expect(accepted.status).toBe("accepted");
  });
});
