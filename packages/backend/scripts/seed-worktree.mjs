import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import {
  assertTarget,
  convex,
  readState,
  root,
  saveState,
} from "./dev-environment.mjs";

export async function seedWorktree() {
  const state = readState();
  const values = assertTarget(state);
  if (state.seeded) {
    console.log(
      "Sample library already initialized; keeping all edits and reviews.",
    );
    return;
  }
  const credentialsPath = join(root, ".armin/demo-account.json");
  const credentials = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, "utf8"))
    : {
        email: `demo-${state.id}@example.com`,
        password: randomBytes(24).toString("base64url"),
      };
  writeFileSync(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });

  // Operator-only component calls with this worktree's scoped deploy key.
  // No fixture endpoint or verification bypass is added to the application.
  function adapter(name, args) {
    return JSON.parse(
      convex(
        [
          "run",
          `adapter:${name}`,
          JSON.stringify(args),
          "--component",
          "betterAuth",
        ],
        { stdio: ["ignore", "pipe", "inherit"] },
      ) || "null",
    );
  }
  const now = Date.now();
  let user = adapter("findOne", {
    model: "user",
    where: [{ field: "email", operator: "eq", value: credentials.email }],
  });
  if (!user) {
    user = adapter("create", {
      input: {
        model: "user",
        data: {
          name: "Agent demo",
          email: credentials.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }
  const userId = user._id;
  const account = adapter("findOne", {
    model: "account",
    where: [
      { field: "userId", operator: "eq", value: userId },
      { field: "providerId", operator: "eq", value: "credential" },
    ],
  });
  if (!account) {
    adapter("create", {
      input: {
        model: "account",
        data: {
          userId,
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(credentials.password),
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }

  const response = await fetch(
    `${values.CONVEX_SITE_URL}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: state.siteUrl },
      body: JSON.stringify(credentials),
    },
  );
  if (!response.ok)
    throw new Error(`Demo sign-in failed with HTTP ${response.status}.`);
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const tokenResponse = await fetch(
    `${values.CONVEX_SITE_URL}/api/auth/convex/token`,
    { headers: { cookie, origin: state.siteUrl } },
  );
  if (!tokenResponse.ok)
    throw new Error(
      `Demo token request failed with HTTP ${tokenResponse.status}.`,
    );
  const { token } = await tokenResponse.json();
  const client = new ConvexHttpClient(values.CONVEX_URL);
  client.setAuth(token);
  try {
    await client.mutation(api.account.ensureLibrary, { timeZone: "UTC" });
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
          front:
            "When does a card blocked by a prerequisite become eligible for study?",
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
    await fetch(`${values.CONVEX_SITE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie, origin: state.siteUrl },
    });
  }
}

if (process.argv[1]?.endsWith("seed-worktree.mjs")) {
  seedWorktree().catch((error) => {
    console.error(`Sample setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
