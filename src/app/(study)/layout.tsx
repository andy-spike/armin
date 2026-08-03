"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  getMockSession,
  subscribe,
  type MockSession,
} from "@/lib/mock/session";

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<MockSession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    setSession(getMockSession());
    return subscribe(() => setSession(getMockSession()));
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/sign-in");
  }, [session, router]);

  if (!session) return null;

  return <AppShell>{children}</AppShell>;
}
