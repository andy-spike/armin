import { hashPassword } from "better-auth/crypto";
import { ConvexHttpClient } from "convex/browser";
import { convex } from "./dev-environment.mjs";

function adapter(name, args) {
  return JSON.parse(
    convex(["run", `adapter:${name}`, JSON.stringify(args), "--component", "betterAuth"], {
      stdio: ["ignore", "pipe", "inherit"],
    }) || "null",
  );
}

export async function ensureDemoAccount({ email, password, name }) {
  const now = Date.now();
  let user = adapter("findOne", {
    model: "user",
    where: [{ field: "email", operator: "eq", value: email }],
  });
  const created = !user;
  if (!user) {
    user = adapter("create", {
      input: {
        model: "user",
        data: { name, email, emailVerified: true, createdAt: now, updatedAt: now },
      },
    });
  }
  const account = adapter("findOne", {
    model: "account",
    where: [
      { field: "userId", operator: "eq", value: user._id },
      { field: "providerId", operator: "eq", value: "credential" },
    ],
  });
  if (!account) {
    adapter("create", {
      input: {
        model: "account",
        data: {
          userId: user._id,
          accountId: user._id,
          providerId: "credential",
          password: await hashPassword(password),
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  }
  return { created };
}

export async function signInDemoAccount(values, state, { email, password }) {
  const response = await fetch(`${values.CONVEX_SITE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: state.siteUrl },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Demo sign-in failed with HTTP ${response.status}.`);
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const tokenResponse = await fetch(`${values.CONVEX_SITE_URL}/api/auth/convex/token`, {
    headers: { cookie, origin: state.siteUrl },
  });
  if (!tokenResponse.ok)
    throw new Error(`Demo token request failed with HTTP ${tokenResponse.status}.`);
  const { token } = await tokenResponse.json();
  const client = new ConvexHttpClient(values.CONVEX_URL);
  client.setAuth(token);
  const signOut = () =>
    fetch(`${values.CONVEX_SITE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie, origin: state.siteUrl },
    });
  return { client, signOut };
}
