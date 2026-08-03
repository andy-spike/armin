"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Brand } from "@/components/brand";
import { LandingPage } from "@/components/landing/landing-page";
import { DecksHome } from "@/components/landing/decks-home";
import {
  getMockSession,
  subscribe,
  type MockSession,
} from "@/lib/mock/session";

export default function Home() {
  const [session, setSession] = useState<MockSession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    setSession(getMockSession());
    return subscribe(() => setSession(getMockSession()));
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-dvh bg-[var(--color-canvas)]">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-6">
          <Brand />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LandingPage />;
  }

  return (
    <AppShell>
      <DecksHome />
    </AppShell>
  );
}
