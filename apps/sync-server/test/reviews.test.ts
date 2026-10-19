import { describe, expect, it } from "vitest";
import {
  cardData,
  find,
  newId,
  newProgress,
  profile,
  reviewEntry,
  signIn,
} from "./helpers";

const reviewed = {
  ...newProgress(),
  reps: 1,
  state: 1,
  stability: 2.3,
  lastReview: 1,
};

async function setup() {
  const device = await signIn();
  const fixture = profile();
  const { position } = await device.upload(fixture.records);
  const review = (
    logId = newId("log"),
    baseVersion = 1,
    flashcardVersion = 1,
  ) => ({
    type: "review" as const,
    mutationId: newId("m"),
    reviewUnitId: fixture.a.unitId,
    baseVersion,
    flashcardVersion,
    progress: reviewed,
    log: { id: logId, ...reviewEntry() },
  });
  const undo = (reviewLogId: string, baseVersion = 2) => ({
    type: "undo_review" as const,
    mutationId: newId("m"),
    reviewUnitId: fixture.a.unitId,
    baseVersion,
    flashcardVersion: 1,
    reviewLogId,
    progress: newProgress(),
  });
  return { device, position, review, undo, ...fixture };
}

describe("reviews", () => {
  it("records the new schedule and its history entry together", async () => {
    const { device, position, review, a } = await setup();
    const logId = newId("log");
    const [result] = await device.push(review(logId));
    expect(result).toMatchObject({
      status: "accepted",
      records: [
        { kind: "review_unit", id: a.unitId, version: 2 },
        { kind: "review_log", id: logId, version: 1 },
      ],
    });
    const { records } = await device.pullAll(position);
    expect(find(records, "review_unit", a.unitId)?.data).toMatchObject({
      progress: reviewed,
    });
    expect(find(records, "review_log", logId)?.data).toMatchObject({
      reviewUnitId: a.unitId,
    });
  });

  it("a concurrent review of the same Review unit conflicts and writes nothing", async () => {
    const { device, position, review, a } = await setup();
    await device.push(review());
    const lateLog = newId("log");
    const [late] = await device.push(review(lateLog));
    expect(late).toMatchObject({
      status: "conflict",
      conflicts: [{ kind: "review_unit", id: a.unitId }],
    });
    expect(
      find((await device.pullAll(position)).records, "review_log", lateLog),
    ).toBeUndefined();
  });

  it("a review shown from an edited Flashcard conflicts", async () => {
    const { device, review, a, deckId } = await setup();
    await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        {
          op: "put",
          kind: "flashcard",
          id: a.id,
          baseVersion: 1,
          data: cardData(deckId, "Edited"),
        },
      ],
    });
    const [result] = await device.push(review());
    expect(result).toMatchObject({
      status: "conflict",
      conflicts: [{ kind: "flashcard", id: a.id }],
    });
  });

  it("undo restores the schedule and removes only the latest review", async () => {
    const { device, position, review, undo, a } = await setup();
    const first = newId("log");
    const second = newId("log");
    await device.push(review(first));
    await device.push(review(second, 2));

    const [stale] = await device.push(undo(first, 3));
    expect(stale.status).toBe("conflict");

    const [undone] = await device.push(undo(second, 3));
    expect(undone.status).toBe("accepted");
    const { records } = await device.pullAll(position);
    expect(find(records, "review_log", second)).toMatchObject({
      deleted: true,
    });
    expect(find(records, "review_log", first)).toMatchObject({
      deleted: false,
    });
    expect(find(records, "review_unit", a.unitId)).toMatchObject({
      version: 4,
      data: { progress: newProgress() },
    });
  });

  it("reviewing a removed Review unit conflicts", async () => {
    const { device, review, a, b, deckId } = await setup();
    await device.push({
      type: "records",
      mutationId: newId("m"),
      operations: [
        { op: "delete", kind: "flashcard", id: a.id, baseVersion: 1 },
        { op: "delete", kind: "review_unit", id: a.unitId, baseVersion: 1 },
        {
          op: "put",
          kind: "deck_graph",
          id: deckId,
          baseVersion: 1,
          data: { edges: [], positions: { [b.id]: { x: 0, y: 0 } } },
        },
      ],
    });
    const [result] = await device.push(review());
    expect(result).toMatchObject({
      status: "conflict",
      conflicts: [
        { kind: "review_unit", id: a.unitId, current: { deleted: true } },
      ],
    });
  });
});
