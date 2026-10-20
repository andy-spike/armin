import { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, Undo2, X } from "lucide-react-native";
import { api } from "@armin/backend/api";
import type { Id, ReviewQueueItem } from "@armin/backend/types";
import { CardSide } from "../card-side";
import { errorMessage, newRequestId } from "../lib/study";
import { easeOutQuart, fonts, space, type, useTheme } from "../theme";
import {
  Button,
  NotebookBackground,
  Notice,
  OfflineBanner,
  Progress,
  Skeleton,
  StatePanel,
  useReducedMotion,
} from "../ui";
import type { ReviewScope } from "./decks";

type Grade = 1 | 2 | 3 | 4;
type Shown = { item: ReviewQueueItem; requestId: string };
type LastReview = { reviewLogId: Id<"reviewLogs">; version: number; requestId: string };

const RATINGS: { grade: Grade; label: string; tone: "again" | "hard" | "good" | "easy" }[] = [
  { grade: 1, label: "Again", tone: "again" },
  { grade: 2, label: "Hard", tone: "hard" },
  { grade: 3, label: "Good", tone: "good" },
  { grade: 4, label: "Easy", tone: "easy" },
];

/**
 * One review at a time. The prompt on screen stays fixed while the queue
 * updates reactively; if it changes elsewhere the rating is refused and the
 * user moves on deliberately.
 */
export function ReviewScreen({
  scope,
  now,
  online,
  onClose,
}: {
  scope: ReviewScope;
  now: number;
  online: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const queue = useQuery(api.review.queue, scope ? { deckId: scope.deckId, now } : { now });
  const rate = useMutation(api.review.rate);
  const undo = useMutation(api.review.undo);
  const [shown, setShown] = useState<Shown | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [last, setLast] = useState<LastReview | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const preview = useQuery(
    api.review.preview,
    shown ? { reviewUnitId: shown.item.reviewUnitId, now } : "skip",
  );
  const enter = useRef(new Animated.Value(1)).current;
  const answer = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (!shown && queue?.items.length) {
      setShown({ item: queue.items[0], requestId: newRequestId() });
      setRevealed(false);
    }
  }, [queue, shown]);

  const shownId = shown?.item.reviewUnitId;
  useEffect(() => {
    if (!shownId || reduced) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      easing: easeOutQuart,
      useNativeDriver: true,
    }).start();
  }, [enter, reduced, shownId]);

  const reveal = () => {
    setRevealed(true);
    if (reduced) return;
    answer.setValue(0);
    Animated.timing(answer, {
      toValue: 1,
      duration: 220,
      easing: easeOutQuart,
      useNativeDriver: true,
    }).start();
  };

  const latest = queue?.items.find((item) => item.reviewUnitId === shownId);
  const changed = Boolean(shown && latest && latest.version !== shown.item.version);
  const remaining = queue?.items.length ?? 0;
  const total = reviewed + remaining;
  const intervals = new Map(
    preview && preview.version === shown?.item.version
      ? preview.options.map((option) => [option.rating, option.label])
      : [],
  );

  const submit = async (rating: Grade) => {
    if (!shown) return;
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
        setLast({ reviewLogId: result.reviewLogId, version: result.version, requestId: newRequestId() });
        setReviewed((count) => count + 1);
      } else {
        setNotice(result.message);
      }
      setShown(null);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const undoLast = async () => {
    if (!last) return;
    setPending(true);
    try {
      const result = await undo({
        reviewLogId: last.reviewLogId,
        expectedVersion: last.version,
        requestId: last.requestId,
      });
      if (result.status === "ok") {
        setNotice("Review undone.");
        setReviewed((count) => Math.max(0, count - 1));
      } else {
        setNotice(result.message);
      }
      setLast(null);
      setShown(null);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const title = scope?.name ?? "All decks";
  const position = shown ? `${Math.min(reviewed + 1, total)} / ${total}` : null;

  return (
    <View style={styles.root}>
      <NotebookBackground />
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top, backgroundColor: theme.bg, borderColor: theme.border },
        ]}
      >
        <Button
          label="Close review"
          variant="ghost"
          icon={X}
          iconOnly
          onPress={onClose}
          style={styles.edgeButton}
        />
        <View style={styles.titleBlock}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.title, { color: theme.ink }]}
          >
            {title}
          </Text>
          {shown && (
            <Text numberOfLines={1} style={[type.mono, styles.upper, { color: theme.muted }]}>
              {scope ? position : `${shown.item.deckName} · ${position}`}
            </Text>
          )}
        </View>
        <Button
          label="Undo"
          accessibilityLabel="Undo last review"
          variant="ghost"
          size="sm"
          icon={Undo2}
          disabled={!last || pending || !online}
          onPress={() => void undoLast()}
          style={styles.undo}
        />
      </View>
      <OfflineBanner online={online} />
      {shown && <Progress value={reviewed} max={total} height={4} />}

      {queue === undefined ? (
        <View style={styles.body}>
          <Skeleton style={styles.skeletonCard} />
        </View>
      ) : queue === null ? (
        <ScrollView contentContainerStyle={[styles.body, styles.centered]}>
          <StatePanel
            icon={AlertTriangle}
            tone="warning"
            title="Deck unavailable"
            description="This deck was deleted or moved on another device."
          >
            <Button label="Back to decks" variant="outline" onPress={onClose} />
          </StatePanel>
        </ScrollView>
      ) : !shown ? (
        <ScrollView contentContainerStyle={[styles.body, styles.centered]}>
          <StatePanel
            icon={CheckCircle2}
            tone="good"
            title="All caught up"
            description={doneCopy(Boolean(scope), reviewed > 0)}
          >
            {notice && (
              <Text style={[type.caption, styles.centerText, { color: theme.muted }]}>{notice}</Text>
            )}
            <Button label="Back to decks" variant="outline" onPress={onClose} />
          </StatePanel>
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            {changed && (
              <Notice tone="warning">
                This card changed on another device. Load the latest version to keep going.
              </Notice>
            )}
            {notice && !changed && <Notice>{notice}</Notice>}
            <Animated.View
              accessibilityLabel="Review card"
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderStrong,
                  opacity: enter,
                  transform: [
                    { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                  ],
                },
              ]}
            >
              <CardSide text={shown.item.front} textStyle={type.cardFront} />
              {revealed && (
                <Animated.View
                  style={[
                    styles.answer,
                    {
                      opacity: answer,
                      transform: [
                        {
                          translateY: answer.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={[styles.rule, { backgroundColor: theme.borderStrong }]} />
                  <CardSide text={shown.item.back} textStyle={type.cardBack} />
                </Animated.View>
              )}
            </Animated.View>
          </ScrollView>

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
            {changed ? (
              <Button label="Load latest" size="lg" onPress={() => setShown(null)} style={styles.action} />
            ) : !revealed ? (
              <Button label="Show answer" size="lg" onPress={reveal} style={styles.action} />
            ) : (
              <View style={styles.ratings}>
                {RATINGS.map(({ grade, label, tone }) => (
                  <RatingButton
                    key={grade}
                    label={label}
                    interval={intervals.get(grade)}
                    color={theme[tone]}
                    pressedColor={theme[`${tone}Deep`]}
                    textColor={theme.onAccent}
                    disabled={pending || !online}
                    onPress={() => void submit(grade)}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function doneCopy(deckScoped: boolean, cleared: boolean) {
  if (cleared) {
    return deckScoped
      ? "You cleared every review unit due in this deck. New review units unlock as their prerequisites are learned."
      : "You cleared every review unit due today. New review units unlock as their prerequisites are learned.";
  }
  return deckScoped
    ? "Nothing is due here right now. Come back when review units are scheduled, or add more to get ahead."
    : "Nothing is due right now. Come back when review units are scheduled, or add more to get ahead.";
}

function RatingButton({
  label,
  interval,
  color,
  pressedColor,
  textColor,
  disabled,
  onPress,
}: {
  label: string;
  interval: string | undefined;
  color: string;
  pressedColor: string;
  textColor: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={interval ? `${label}, next review in ${interval}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rating,
        {
          backgroundColor: pressed ? pressedColor : color,
          opacity: disabled ? 0.5 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
      ]}
    >
      <Text style={[styles.ratingLabel, { color: textColor }]}>{label}</Text>
      <Text style={[styles.ratingInterval, { color: textColor }]}>{interval ?? "…"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.xs,
    borderBottomWidth: 1,
  },
  edgeButton: { width: 56, height: 56 },
  titleBlock: { flex: 1, alignItems: "center", paddingHorizontal: space.sm },
  title: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 22, letterSpacing: -0.15 },
  upper: { textTransform: "uppercase", fontSize: 11, letterSpacing: 0.4, marginTop: 1 },
  undo: { marginRight: space.xs },
  body: { flexGrow: 1, padding: space.md, gap: 12 },
  centered: { justifyContent: "center" },
  // Matches the rating row so the card doesn't shift when the answer shows.
  action: { height: 60 },
  skeletonCard: { flex: 1, minHeight: 280 },
  card: {
    flexGrow: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  answer: { width: "100%", alignItems: "center" },
  rule: { width: 64, height: 1, marginVertical: 28 },
  centerText: { textAlign: "center" },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: space.md, paddingTop: 12 },
  ratings: { flexDirection: "row", gap: space.sm },
  rating: {
    flex: 1,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  ratingLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 20 },
  ratingInterval: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, opacity: 0.85 },
});
