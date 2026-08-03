import { settings, subscriptions, users } from "@/db/schema";
import { db } from "@/lib/db";

export async function ensureUser(id: string, email: string): Promise<void> {
  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values({ id, email, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
    await tx
      .insert(settings)
      .values({ userId: id, updatedAt: now })
      .onConflictDoNothing();
    await tx
      .insert(subscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  });
}
