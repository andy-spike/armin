import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronRight, Layers, LogOut } from "lucide-react-native";
import { api } from "@armin/backend/api";
import type { DeckWithStats, Id } from "@armin/backend/types";
import { formatInterval } from "@armin/core/study";
import { authClient } from "../lib/auth-client";
import { plural } from "../lib/study";
import { space, type, useTheme } from "../theme";
import {
  Button,
  NotebookBackground,
  OfflineBanner,
  Progress,
  Skeleton,
  Stat,
  StatePanel,
} from "../ui";

export type ReviewScope = { deckId: Id<"decks">; name: string } | null;

export function DecksScreen({
  email,
  hasLibrary,
  now,
  online,
  onReview,
}: {
  email: string;
  hasLibrary: boolean;
  now: number;
  online: boolean;
  onReview: (scope: ReviewScope) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const decks = useQuery(api.decks.list, hasLibrary ? { now } : "skip");
  const queue = useQuery(api.review.queue, hasLibrary ? { now } : "skip");

  const confirmSignOut = () =>
    Alert.alert("Sign out of Armin?", "You'll need your email and password to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void authClient.signOut() },
    ]);

  const subtitle =
    decks && decks.length > 0
      ? `${plural(decks.length, "deck")}, building toward what's next.`
      : "Your study decks live here.";

  return (
    <View style={styles.root}>
      <NotebookBackground />
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top, backgroundColor: theme.bg, borderColor: theme.border },
        ]}
      >
        <Text accessibilityRole="header" style={[type.wordmark, { color: theme.ink }]}>
          Armin
        </Text>
        <Button
          label="Sign out"
          variant="ghost"
          icon={LogOut}
          iconOnly
          onPress={confirmSignOut}
          style={styles.edgeButton}
        />
      </View>
      <OfflineBanner online={online} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.xl }]}>
        <Text accessibilityRole="header" style={[type.display, { color: theme.ink }]}>
          Decks
        </Text>
        <Text style={[type.body, styles.subtitle, { color: theme.muted }]}>{subtitle}</Text>

        <View style={styles.body}>
          {!hasLibrary ? (
            <StatePanel
              icon={Layers}
              title="Set up your library"
              description="Open Armin on the web once to set up your library, then come back here to study."
            />
          ) : decks === undefined ? (
            <DeckListSkeleton />
          ) : decks === null || decks.length === 0 ? (
            <StatePanel
              icon={Layers}
              dashed
              title="No decks yet"
              description="A deck is a set of flashcards on one subject. Create your first one on the web, then study it here."
            />
          ) : (
            <View style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {decks.map((deck, index) => (
                <DeckRow
                  key={deck.id}
                  deck={deck}
                  first={index === 0}
                  onPress={() => onReview({ deckId: deck.id, name: deck.name })}
                />
              ))}
            </View>
          )}
        </View>

        <Text style={[type.caption, styles.account, { color: theme.muted }]}>
          Signed in as {email}
        </Text>
      </ScrollView>

      {hasLibrary && (
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom + space.md,
              backgroundColor: theme.bg,
              borderColor: theme.border,
            },
          ]}
        >
          {queue === undefined ? (
            <Skeleton style={styles.ctaSkeleton} />
          ) : queue && queue.items.length > 0 ? (
            <Button
              label="Review all decks"
              trailing={`${queue.items.length} due`}
              size="lg"
              onPress={() => onReview(null)}
            />
          ) : (
            <View style={styles.caughtUp} accessibilityRole="text">
              <CheckCircle2 size={18} color={theme.good} strokeWidth={1.75} />
              <Text style={[type.bodyMedium, { color: theme.ink }]}>All caught up</Text>
              {queue?.nextDueAt && (
                <Text style={[type.caption, { color: theme.muted }]}>
                  · next review in {formatInterval(now, queue.nextDueAt)}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function DeckRow({ deck, first, onPress }: { deck: DeckWithStats; first: boolean; onPress: () => void }) {
  const theme = useTheme();
  const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${deck.name}. ${plural(deck.total, "flashcard")}, ${deck.due} due.`}
      accessibilityHint="Starts a review of this deck"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.borderStrong,
          backgroundColor: pressed ? theme.bg2 : "transparent",
        },
      ]}
    >
      <View style={styles.rowHead}>
        <Text style={[type.deckName, styles.flex, { color: theme.ink }]} numberOfLines={2}>
          {deck.name}
        </Text>
        <ChevronRight size={18} color={theme.muted} strokeWidth={1.75} />
      </View>
      {deck.description ? (
        <Text style={[type.caption, styles.description, { color: theme.muted }]} numberOfLines={2}>
          {deck.description}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={[type.caption, { color: theme.muted }]}>{plural(deck.total, "flashcard")}</Text>
        <Text style={[type.caption, styles.tabular, { color: theme.muted }]}>{pct}% learned</Text>
      </View>
      <Progress value={deck.learned} max={deck.total} tone="good" />
      <View style={styles.stats}>
        {deck.due > 0 && <Stat color={theme.accent} label={`${deck.due} due`} emphatic />}
        {deck.newCount > 0 && <Stat color={theme.new} label={`${deck.newCount} new`} />}
        {deck.learning > 0 && <Stat color={theme.learning} label={`${deck.learning} learning`} />}
        {deck.due === 0 && deck.newCount === 0 && (
          <Text style={[type.caption, { color: theme.muted }]}>All caught up</Text>
        )}
      </View>
    </Pressable>
  );
}

function DeckListSkeleton() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Loading decks"
      style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.row,
            { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderColor: theme.borderStrong },
          ]}
        >
          <Skeleton style={{ height: 20, width: "60%" }} />
          <Skeleton style={{ height: 12, width: "90%", marginTop: 10 }} />
          <Skeleton style={{ height: 6, width: "100%", marginTop: 16 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderBottomWidth: 1,
  },
  edgeButton: { width: 56, height: 56 },
  content: { paddingHorizontal: space.md, paddingTop: space.lg },
  subtitle: { marginTop: 6 },
  body: { marginTop: space.lg },
  list: { borderWidth: 1 },
  row: { paddingHorizontal: space.md, paddingVertical: space.md },
  rowHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  description: { marginTop: 2 },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 6,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  stats: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4, marginTop: 10 },
  account: { marginTop: space.lg, textAlign: "center" },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: space.md, paddingTop: 12 },
  ctaSkeleton: { height: 52 },
  caughtUp: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
});
