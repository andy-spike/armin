import { AppShell } from "@/components/app-shell";
import { DecksHome } from "@/components/landing/decks-home";
import { LandingPage } from "@/components/landing/landing-page";
import { ensureAuthUser } from "@/lib/auth";

export default async function Home() {
  const user = await ensureAuthUser();

  if (!user) {
    return <LandingPage />;
  }

  return (
    <AppShell user={user}>
      <DecksHome />
    </AppShell>
  );
}
