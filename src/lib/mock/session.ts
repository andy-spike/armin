import { useCallback, useSyncExternalStore } from "react";

export interface MockSession {
  userId: string;
  email: string;
  name: string;
}

const KEY = "armin:mock-session";
const listeners = new Set<() => void>();

let cached: MockSession | null | undefined;

function read(): MockSession | null {
  if (typeof window === "undefined") return null;
  if (cached !== undefined) return cached;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(raw) as MockSession;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  for (const l of listeners) l();
}

export function setMockSession(session: MockSession | null) {
  cached = session;
  if (session) {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(KEY);
  }
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getMockSession(): MockSession | null {
  return read();
}

export function useMockSession(): MockSession | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function signInMock(email: string): MockSession {
  const session: MockSession = {
    userId: "user-mock-1",
    email,
    name: email.split("@")[0] ?? "Reader",
  };
  setMockSession(session);
  return session;
}
