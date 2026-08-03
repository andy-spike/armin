import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ensureAuthUser } from "@/lib/auth";

export default async function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureAuthUser();
  if (!user) redirect("/sign-in");

  return <AppShell user={user}>{children}</AppShell>;
}
