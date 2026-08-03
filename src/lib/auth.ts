import { ensureUser } from "@/lib/services/users";
import { createClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

function toAuthUser(claims: Record<string, unknown>): AuthUser | null {
  if (typeof claims.sub !== "string") return null;
  const email = typeof claims.email === "string" ? claims.email : "";
  const meta = claims.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name : "";
  const name = fullName || email.split("@")[0] || "Reader";
  return { id: claims.sub, email, name };
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? toAuthUser(data.claims) : null;
}

export async function ensureAuthUser(): Promise<AuthUser | null> {
  const user = await getAuthUser();
  if (user) await ensureUser(user.id, user.email);
  return user;
}
