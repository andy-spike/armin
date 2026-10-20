import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { authClient } from "../lib/auth-client";
import { fonts, space, type, useTheme } from "../theme";
import { Button, NotebookBackground, Notice, TextField } from "../ui";

export function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
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
    <View style={styles.root}>
      <NotebookBackground />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 56, paddingBottom: insets.bottom + space.xl },
          ]}
        >
          <Text accessibilityRole="header" style={[styles.wordmark, { color: theme.ink }]}>
            Armin
          </Text>

          <View
            style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[type.headline, { color: theme.ink }]}>Sign in</Text>
            <Text style={[type.body, styles.subtitle, { color: theme.muted }]}>
              Sign in with the account you use on the web.
            </Text>

            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <TextField
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                accessory={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    onPress={() => setShowPassword((value) => !value)}
                    style={styles.reveal}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={theme.muted} strokeWidth={1.75} />
                    ) : (
                      <Eye size={18} color={theme.muted} strokeWidth={1.75} />
                    )}
                  </Pressable>
                }
              />
              {error && <Notice tone="error">{error}</Notice>}
              <Button
                label="Sign in"
                size="lg"
                busy={busy}
                disabled={!ready}
                onPress={() => void submit()}
              />
            </View>
          </View>

          <Text style={[type.caption, styles.footer, { color: theme.muted }]}>
            New to Armin? Create an account on the web, then sign in here.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: "center", paddingHorizontal: space.md },
  wordmark: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  panel: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingTop: 28,
    paddingBottom: space.lg,
  },
  subtitle: { marginTop: 6 },
  form: { marginTop: space.lg, gap: space.md },
  reveal: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  footer: { marginTop: space.lg, textAlign: "center", maxWidth: 320 },
});
