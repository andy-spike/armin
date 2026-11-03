import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { anyApi as api } from "convex/server";
import { ensureDemoAccount, signInDemoAccount } from "./demo-account.mjs";
import { assertTarget, readState, root, saveState } from "./dev-environment.mjs";

export async function seedWorktree() {
  const state = readState();
  const values = assertTarget(state);
  const credentialsPath = join(root, ".armin/demo-account.json");
  const credentials = {
    email: "test@example.com",
    password: "armin1234",
  };
  writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });

  const { created: createdUser } = await ensureDemoAccount({
    ...credentials,
    name: "Agent demo",
  });
  const { client, signOut } = await signInDemoAccount(values, state, credentials);
  try {
    await client.mutation(api.account.ensureLibrary, { timeZone: "UTC" });
    if (state.seeded && !createdUser) {
      console.log("Test login verified; keeping all existing sample data.");
      return;
    }
    const { id: deckId } = await client.mutation(api.decks.create, {
      name: "Agent sample library",
      description: "Synthetic data for this worktree only.",
      requestId: `fixture:${state.id}:deck`,
    });
    const samples = [
      {
        type: "basic",
        content: {
          front: "What does a prerequisite link represent in Armin?",
          back: "Knowledge to learn before studying the dependent card.",
        },
      },
      {
        type: "basic",
        content: {
          front: "When does a card blocked by a prerequisite become eligible for study?",
          back: "When its active prerequisites are secured.",
        },
      },
      {
        type: "cloze",
        content: { text: "Armin schedules reviews using {{1::FSRS}}." },
      },
      {
        type: "type_answer",
        content: {
          prompt: "What abbreviation names Armin's review scheduler?",
          answer: "FSRS",
          acceptedAnswers: [],
        },
      },
    ];
    const cards = [];
    for (const [index, sample] of samples.entries()) {
      cards.push(
        await client.mutation(api.flashcards.create, {
          deckId,
          ...sample,
          tags: ["demo"],
          requestId: `fixture:${state.id}:card:${index}`,
        }),
      );
    }
    const graph = await client.query(api.graph.getDeck, { deckId });
    await client.mutation(api.graph.addPrereq, {
      prereqId: cards[0].id,
      dependentId: cards[1].id,
      expectedVersion: graph.version,
    });
    state.seeded = true;
    saveState(state);
    console.log(
      `Created sample library with four cards and a prerequisite. Demo login: ${credentialsPath}`,
    );
  } finally {
    await signOut();
  }
}

if (process.argv[1]?.endsWith("seed-worktree.mjs")) {
  seedWorktree().catch((error) => {
    console.error(`Sample setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
