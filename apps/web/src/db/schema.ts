import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  githubId: text("github_id").notNull().unique(),
  handle: text("handle").notNull().unique(),
  timezone: text("timezone").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    type: text("type")
      .$type<"github" | "gitlab" | "ingest">()
      .notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    baseUrl: text("base_url"),
    credentialEncrypted: text("credential_encrypted"),
    apiKeyHash: text("api_key_hash"),
    status: text("status")
      .$type<"ok" | "backfilling" | "error">()
      .notNull()
      .default("ok"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("connections_user_id_slug_unique").on(table.userId, table.slug),
  ],
);

export const dailyCounts = sqliteTable(
  "daily_counts",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.date] })],
);

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);
