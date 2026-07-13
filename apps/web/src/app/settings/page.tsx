import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isPendingHandle } from "@/lib/handle";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/settings");
  }

  const db = getDb();
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  if (!user) {
    redirect("/api/auth/signin?callbackUrl=/settings");
  }

  if (isPendingHandle(user.handle)) {
    redirect("/welcome");
  }

  return (
    <SettingsClient account={{ handle: user.handle, name: user.name ?? null }} />
  );
}
