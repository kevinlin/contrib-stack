import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "@auth/core/adapters";
import { and, eq } from "drizzle-orm";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getDb } from "@/db/client";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { isPendingHandle, PENDING_HANDLE_PREFIX } from "@/lib/handle";

function createAdapter(): Adapter {
  const db = getDb();
  const baseAdapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });

  return {
    ...baseAdapter,
    async createUser(user) {
      const id = user.id ?? crypto.randomUUID();
      return db
        .insert(users)
        .values({
          id,
          githubId: "pending",
          handle: `${PENDING_HANDLE_PREFIX}${id}`,
          timezone: "UTC",
          isPrivate: false,
          createdAt: new Date().toISOString(),
          name: user.name ?? null,
          email: user.email ?? null,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
        })
        .returning()
        .get();
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: createAdapter(),
  providers: [GitHub],
  callbacks: {
    async signIn({ user }) {
      if (!user.id) {
        return true;
      }

      const dbUser = getDb()
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .get();

      if (dbUser && isPendingHandle(dbUser.handle)) {
        return "/welcome";
      }

      return true;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async linkAccount({ user, account }) {
      if (account.provider !== "github" || !user.id) {
        return;
      }

      const db = getDb();
      db.update(users)
        .set({ githubId: account.providerAccountId })
        .where(eq(users.id, user.id))
        .run();

      db.update(accounts)
        .set({
          access_token: null,
          refresh_token: null,
          scope: null,
          token_type: null,
          expires_at: null,
        })
        .where(
          and(
            eq(accounts.provider, "github"),
            eq(accounts.providerAccountId, account.providerAccountId),
          ),
        )
        .run();
    },
  },
  trustHost: true,
});
