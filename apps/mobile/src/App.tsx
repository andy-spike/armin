import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ConvexReactClient, useMutation, useQuery } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexError } from "convex/values";
import { api } from "@armin/backend/api";
import type { Id, ReviewQueueItem } from "@armin/backend/types";
import { parseMediaRef } from "@armin/core/media-ref";
import { authClient, convexToken } from "./lib/auth-client";
import { convexSiteUrl, convexUrl } from "./lib/env";

/**
 * Minimal authenticated smoke path for the shared backend: sign in, read the
 * library, rate and undo one review, and load a private image. Full mobile
 * authoring and study screens are later work.
 */

const convex = new ConvexReactClient(convexUrl, { expectAuth: true });

export default function App() {
  return (
    <SafeAreaProvider>
      <ConvexBetterAuthProvider client={convex} authClient={authClient as never}>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <Root />
        </SafeAreaView>
      </ConvexBetterAuthProvider>
    </SafeAreaProvider>
  );
}

function message(error: unknown) {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (data?.message) return data.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

function Root() {
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  if (!session.data) return <SignIn />;
  return <Library />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.status === 403
          ? "Verify your email first, using the link we sent."
          : "Email or password is incorrect.",
      );
    }
  };

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Armin</Text>
      <Text style={styles.muted}>Sign in with the account you use on the web.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        accessibilityLabel="Email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        accessibilityLabel="Password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Sign in" onPress={submit} disabled={busy || !email || !password} />
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
  grow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline";
  grow?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === "outline" && styles.buttonOutline,
        grow && styles.buttonGrow,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={variant === "outline" ? styles.buttonOutlineText : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A clock for time-dependent queries, so due reviews appear without writes. */
function useNow(stepMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / stepMs) * stepMs);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / stepMs) * stepMs), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

function Library() {
  const viewer = useQuery(api.account.viewer, {});
  const now = useNow();
  const decks = useQuery(api.decks.list, viewer?.library?.status === "active" ? { now } : "skip");

  if (viewer === undefined)
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  if (viewer === null)
    return (
      <Centered>
        <Text>Your session ended.</Text>
      </Centered>
    );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.row}>
        <Text style={styles.title}>Armin</Text>
        <Button label="Sign out" variant="outline" onPress={() => void authClient.signOut()} />
      </View>
      <Text style={styles.muted}>{viewer.email}</Text>
      {viewer.reviewer && (
        <Text style={styles.muted}>
          Shared test account. Everyone can see and change this library. Data resets every{" "}
          {viewer.reviewer.resetHours} hours. Do not add private material.
        </Text>
      )}
      {!viewer.library ? (
        <Text style={styles.muted}>Open Armin on the web once to set up your library.</Text>
      ) : viewer.library.status !== "active" ? (
        <Text style={styles.muted}>
          This library is temporarily unavailable. Please try again shortly.
        </Text>
      ) : (
        <>
          <Text style={styles.heading}>Decks</Text>
          {decks === undefined ? (
            <ActivityIndicator />
          ) : decks === null || decks.length === 0 ? (
            <Text style={styles.muted}>No decks yet. Create one on the web.</Text>
          ) : (
            decks.map((deck) => (
              <View key={deck.id} style={styles.deck} accessibilityLabel={`Deck ${deck.name}`}>
                <Text style={styles.deckName}>{deck.name}</Text>
                <Text style={styles.muted}>
                  {deck.total} {deck.total === 1 ? "flashcard" : "flashcards"} · {deck.due} due
                </Text>
              </View>
            ))
          )}
          <Text style={styles.heading}>Review</Text>
          <Study now={now} />
        </>
      )}
    </ScrollView>
  );
}

type Shown = { item: ReviewQueueItem; requestId: string };

/**
 * One review at a time. The prompt on screen stays fixed while the queue
 * updates reactively; if it changes elsewhere the rating is refused and the
 * user moves on deliberately.
 */
function Study({ now }: { now: number }) {
  const queue = useQuery(api.review.queue, { now });
  const rate = useMutation(api.review.rate);
  const undo = useMutation(api.review.undo);
  const [shown, setShown] = useState<Shown | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [last, setLast] = useState<{ reviewLogId: Id<"reviewLogs">; version: number } | null>(null);

  if (!shown && queue?.items.length) {
    setShown({ item: queue.items[0], requestId: newRequestId() });
    setRevealed(false);
  }

  const latest = queue?.items.find((item) => item.reviewUnitId === shown?.item.reviewUnitId);
  const changed = Boolean(shown && latest && latest.version !== shown.item.version);

  if (queue === undefined) return <ActivityIndicator />;
  if (!shown) {
    return (
      <View>
        <Text style={styles.muted}>All caught up.</Text>
        {last && (
          <UndoButton
            last={last}
            undo={undo}
            onDone={setNotice}
            pending={pending}
            setPending={setPending}
            clear={() => setLast(null)}
          />
        )}
        {notice && <Text style={styles.muted}>{notice}</Text>}
      </View>
    );
  }

  const submit = async (rating: 1 | 2 | 3 | 4) => {
    setPending(true);
    setNotice(null);
    try {
      // The same request id is reused if this answer is retried.
      const result = await rate({
        reviewUnitId: shown.item.reviewUnitId,
        rating,
        expectedVersion: shown.item.version,
        requestId: shown.requestId,
      });
      if (result.status === "ok") {
        setLast({ reviewLogId: result.reviewLogId, version: result.version });
      } else {
        setNotice(result.message);
      }
      setShown(null);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.card} accessibilityLabel="Review card">
      <Text style={styles.muted}>
        {shown.item.deckName} · {queue?.reviewCount ?? 0} due, {queue?.newCount ?? 0} new
      </Text>
      <CardSide text={shown.item.front} />
      {revealed && (
        <>
          <View style={styles.divider} />
          <CardSide text={shown.item.back} />
        </>
      )}
      {changed && (
        <Text style={styles.error}>
          This card changed on another device. Skip it to load the latest version.
        </Text>
      )}
      {notice && <Text style={styles.muted}>{notice}</Text>}
      {changed ? (
        <Button label="Load latest" onPress={() => setShown(null)} />
      ) : !revealed ? (
        <Button label="Show answer" onPress={() => setRevealed(true)} />
      ) : (
        <View style={styles.grades}>
          {(["Again", "Hard", "Good", "Easy"] as const).map((label, index) => (
            <Button
              key={label}
              label={label}
              grow
              disabled={pending}
              onPress={() => void submit((index + 1) as 1 | 2 | 3 | 4)}
            />
          ))}
        </View>
      )}
      {last && (
        <UndoButton
          last={last}
          undo={undo}
          onDone={setNotice}
          pending={pending}
          setPending={setPending}
          clear={() => {
            setLast(null);
            setShown(null);
          }}
        />
      )}
    </View>
  );
}

function UndoButton({
  last,
  undo,
  onDone,
  pending,
  setPending,
  clear,
}: {
  last: { reviewLogId: Id<"reviewLogs">; version: number };
  undo: ReturnType<typeof useMutation<typeof api.review.undo>>;
  onDone: (message: string) => void;
  pending: boolean;
  setPending: (value: boolean) => void;
  clear: () => void;
}) {
  // A fresh request id for each review that can be undone.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const requestId = useMemo(() => newRequestId(), [last.reviewLogId]);
  return (
    <Button
      label="Undo last review"
      variant="outline"
      disabled={pending}
      onPress={async () => {
        setPending(true);
        try {
          const result = await undo({
            reviewLogId: last.reviewLogId,
            expectedVersion: last.version,
            requestId,
          });
          onDone(result.status === "ok" ? "Review undone." : result.message);
          clear();
        } catch (error) {
          onDone(message(error));
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** Card text with Markdown images pulled out and loaded privately. */
function CardSide({ text }: { text: string }) {
  const images = [...text.matchAll(MARKDOWN_IMAGE)]
    .map((match) => parseMediaRef(match[1]))
    .filter((fileName): fileName is string => Boolean(fileName));
  const plain = text.replace(MARKDOWN_IMAGE, "").trim();
  return (
    <View style={styles.side}>
      {plain.length > 0 && <Text style={styles.cardText}>{plain}</Text>}
      {images.map((fileName) => (
        <PrivateImage key={fileName} fileName={fileName} />
      ))}
    </View>
  );
}

/**
 * Images are never public URLs: each request carries the session's Convex
 * token and the backend checks the image belongs to the caller's library.
 * The bytes are fetched here because Android's Image drops custom headers.
 */
function PrivateImage({ fileName }: { fileName: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await convexToken();
        if (!token) throw new Error("Signed out");
        const response = await fetch(`${convexSiteUrl}/media/${fileName}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get("content-type") ?? "image/png";
        const dataUri = `data:${type};base64,${toBase64(await response.arrayBuffer())}`;
        if (active) setUri(dataUri);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [fileName]);
  if (failed) return <Text style={styles.error}>Image unavailable.</Text>;
  if (!uri) return <ActivityIndicator />;
  return (
    <Image
      accessibilityLabel="Flashcard image"
      style={styles.image}
      resizeMode="contain"
      source={{ uri }}
    />
  );
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function newRequestId() {
  return crypto.randomUUID();
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fffcf0" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  page: { padding: 24, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "600", color: "#100f0f" },
  heading: { fontSize: 18, fontWeight: "600", color: "#100f0f", marginTop: 12 },
  muted: { fontSize: 14, color: "#6f6e69" },
  error: { fontSize: 14, color: "#af3029" },
  input: {
    borderWidth: 1,
    borderColor: "#cecdc3",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#24837b",
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  buttonOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#cecdc3" },
  buttonGrow: { flexGrow: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fffcf0", fontWeight: "600" },
  buttonOutlineText: { color: "#100f0f", fontWeight: "500" },
  deck: { borderWidth: 1, borderColor: "#e6e4d9", backgroundColor: "#ffffff", padding: 12, gap: 4 },
  deckName: { fontSize: 16, fontWeight: "600", color: "#100f0f" },
  card: {
    borderWidth: 1,
    borderColor: "#e6e4d9",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 12,
  },
  side: { gap: 8 },
  cardText: { fontSize: 18, color: "#100f0f" },
  divider: { height: 1, backgroundColor: "#e6e4d9" },
  grades: { flexDirection: "row", gap: 6 },
  image: { width: "100%", height: 160, backgroundColor: "#f2f0e5" },
});
