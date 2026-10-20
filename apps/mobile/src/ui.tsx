import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Defs, Line, Pattern, Rect, Svg } from "react-native-svg";
import { CloudOff, type LucideIcon } from "lucide-react-native";
import { fonts, space, type, useTheme } from "./theme";

/** Hex color with an alpha channel, for the web's `bg-again/10`-style tints. */
export function alpha(hex: string, opacity: number) {
  const value = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${value}`;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * The web app's ruled-notebook field: faint horizontal rules every 24dp with
 * fainter verticals, drawn once as an SVG pattern behind the content.
 */
export function NotebookBackground() {
  const theme = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="notebook" width={24} height={24} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0.5} x2={24} y2={0.5} stroke={theme.gridH} strokeWidth={1} />
            <Line x1={0.5} y1={0} x2={0.5} y2={24} stroke={theme.gridV} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={theme.bg} />
        <Rect width="100%" height="100%" fill="url(#notebook)" />
      </Svg>
    </View>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";

/**
 * Mirrors the web Button: `busy` makes it non-interactive and reports busy to
 * assistive tech without changing the label (apps/desktop/docs/adr/0016).
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconOnly,
  busy,
  disabled,
  trailing,
  style,
  accessibilityLabel,
}: {
  label: string;
  /** Secondary mono text after the label, e.g. a count. */
  trailing?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconOnly?: boolean;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const inactive = Boolean(disabled || busy);
  const colors = {
    primary: { bg: theme.accent, pressed: theme.accentDeep, fg: theme.onAccent, border: theme.accent },
    destructive: { bg: theme.again, pressed: theme.againDeep, fg: theme.onAccent, border: theme.again },
    outline: { bg: theme.surface, pressed: theme.bg2, fg: theme.ink, border: theme.borderStrong },
    ghost: { bg: "transparent", pressed: theme.bg2, fg: theme.ink, border: "transparent" },
  }[variant];
  const height = size === "lg" ? 52 : size === "md" ? 48 : 40;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: Boolean(busy) }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === "sm" ? 4 : undefined}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          minWidth: height,
          paddingHorizontal: iconOnly ? 0 : size === "sm" ? 12 : 20,
          backgroundColor: pressed ? colors.pressed : colors.bg,
          borderColor: pressed && variant === "outline" ? theme.ui3 : colors.border,
          opacity: inactive ? 0.5 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        style,
      ]}
    >
      {Icon && <Icon size={size === "sm" ? 16 : 18} color={colors.fg} strokeWidth={1.75} />}
      {!iconOnly && (
        <Text
          style={[
            size === "sm" ? styles.buttonLabelSm : styles.buttonLabel,
            { color: colors.fg },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
      {trailing && (
        <Text style={[styles.buttonTrailing, { color: colors.fg }]} numberOfLines={1}>
          {trailing}
        </Text>
      )}
    </Pressable>
  );
}

export const TextField = forwardRef<
  TextInput,
  TextInputProps & { label: string; accessory?: ReactNode }
>(function TextField({ label, accessory, style, ...props }, ref) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[type.label, { color: theme.ink }]}>{label}</Text>
      <View
        style={[
          styles.inputFrame,
          {
            backgroundColor: theme.surface,
            borderColor: focused ? theme.accent : theme.borderStrong,
          },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={theme.muted}
          selectionColor={theme.accent}
          cursorColor={theme.accent}
          {...props}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          style={[styles.input, { color: theme.ink }, style]}
        />
        {accessory}
      </View>
    </View>
  );
});

/** Inline status line: `error` for failures, `info` for neutral notices, `warning` for stale state. */
export function Notice({
  tone = "info",
  children,
  action,
}: {
  tone?: "error" | "info" | "warning";
  children: ReactNode;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const palette = {
    error: { border: alpha(theme.again, 0.4), bg: alpha(theme.again, 0.1) },
    warning: { border: alpha(theme.hard, 0.5), bg: alpha(theme.hard, 0.1) },
    info: { border: theme.borderStrong, bg: theme.bg2 },
  }[tone];
  return (
    <View
      accessibilityRole={tone === "info" ? "text" : "alert"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.bg }]}
    >
      <Text style={[type.caption, styles.noticeText, { color: theme.ink }]}>{children}</Text>
      {action}
    </View>
  );
}

/** Shown under a screen's top bar while the device is offline, as on the web. */
export function OfflineBanner({ online }: { online: boolean }) {
  const theme = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.offline, { backgroundColor: alpha(theme.hard, 0.15), borderColor: alpha(theme.hard, 0.4) }]}
    >
      <CloudOff size={14} color={theme.ink} strokeWidth={1.75} />
      <Text style={[type.caption, styles.offlineText, { color: theme.ink }]}>
        Offline. Reviewing is paused until the connection returns.
      </Text>
    </View>
  );
}

/** Slim progress meter: tone fill on a border-toned track. */
export function Progress({
  value,
  max,
  tone = "accent",
  height = 6,
}: {
  value: number;
  max: number;
  tone?: "accent" | "good";
  height?: number;
}) {
  const theme = useTheme();
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height, backgroundColor: theme.border, overflow: "hidden" }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: tone === "good" ? theme.good : theme.accent,
        }}
      />
    </View>
  );
}

/**
 * Empty, error, and done panels share the web's shape: a sunken field, a
 * square icon tile, a short headline, and one way forward.
 */
export function StatePanel({
  icon: Icon,
  tone = "accent",
  title,
  description,
  children,
  dashed,
}: {
  icon: LucideIcon;
  tone?: "accent" | "good" | "warning";
  title: string;
  description?: string;
  children?: ReactNode;
  dashed?: boolean;
}) {
  const theme = useTheme();
  const tile = {
    accent: { bg: theme.accentTint, fg: theme.accentDeep },
    good: { bg: theme.reviewBg, fg: theme.good },
    warning: { bg: theme.relearningBg, fg: theme.relearning },
  }[tone];
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.bg2,
          borderColor: dashed ? theme.borderStrong : theme.border,
          borderStyle: dashed ? "dashed" : "solid",
        },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: tile.bg }]}>
        <Icon size={24} color={tile.fg} strokeWidth={1.5} />
      </View>
      <Text accessibilityRole="header" style={[type.headline, styles.center, { color: theme.ink }]}>
        {title}
      </Text>
      {description && (
        <Text style={[type.body, styles.center, styles.panelText, { color: theme.muted }]}>
          {description}
        </Text>
      )}
      {children && <View style={styles.panelActions}>{children}</View>}
    </View>
  );
}

/** Placeholder block that breathes gently while data loads. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return <Animated.View style={[{ backgroundColor: theme.border, opacity: pulse }, style]} />;
}

/** Small square swatch + label, as on the web deck tiles. */
export function Stat({ color, label, emphatic }: { color: string; label: string; emphatic?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text
        style={[
          type.caption,
          emphatic ? { fontFamily: fonts.sansMedium, color: theme.ink } : { color: theme.muted },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderWidth: 1,
  },
  buttonLabel: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 20 },
  buttonTrailing: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, opacity: 0.85 },
  buttonLabelSm: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 18 },
  field: { gap: 6 },
  inputFrame: { flexDirection: "row", alignItems: "center", borderWidth: 1, minHeight: 48 },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: { flex: 1, minWidth: 160 },
  panel: {
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: 48,
  },
  tile: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  center: { textAlign: "center" },
  panelText: { marginTop: 6, maxWidth: 320 },
  panelActions: { marginTop: 20, gap: space.sm, alignItems: "center" },
  offline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderBottomWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  offlineText: { flexShrink: 1, textAlign: "center" },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statDot: { width: 6, height: 6 },
});
