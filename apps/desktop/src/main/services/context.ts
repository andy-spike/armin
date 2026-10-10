import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@armin/core/schema";

export type ServiceContext = {
  profileId: string;
  db: BetterSQLite3Database<typeof schema>;
};
