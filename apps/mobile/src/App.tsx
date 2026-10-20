import { Component, useState, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { SourceSerif4_600SemiBold } from "@expo-google-fonts/source-serif-4/600SemiBold";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { ConvexReactClient, useQuery } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { AlertTriangle, LogOut } from "lucide-react-native";
import { api } from "@armin/backend/api";
import { authClient } from "./lib/auth-client";
import { convexUrl } from "./lib/env";
import { useNow, useOnline } from "./lib/study";
import { DecksScreen, type ReviewScope } from "./screens/decks";
import { ReviewScreen } from "./screens/review";
import { SignInScreen } from "./screens/sign-in";
import { space, useTheme } from "./theme";
import { Button, NotebookBackground, StatePanel } from "./ui";

/**
 * Authenticated mobile client for the shared backend: sign in, see the
 * library's decks, and review one card at a time with rating and undo.
 * Authoring and settings live on the web for now.
 */

const convex = new ConvexReactClient(convexUrl, { expectAuth: true });

export default function App() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SourceSerif4_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  return (
    <SafeAreaProvider style={{ backgroundColor: theme.bg }}>
      <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
      {fontsLoaded ? (
        <ConvexBetterAuthProvider client={convex} authClient={authClient as never}>
          <ErrorBoundary>
            <Root />
          </ErrorBoundary>
        </ConvexBetterAuthProvider>
      ) : (
        <Loading />
      )}
    </SafeAreaProvider>
  );
}

function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.centered}>
      <NotebookBackground />
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}

function Root() {
  const session = authClient.useSession();
  if (session.isPending) return <Loading />;
  if (!session.data) return <SignInScreen />;
  return <Library />;
}

function Library() {
  const viewer = useQuery(api.account.viewer, {});
  const now = useNow();
  const online = useOnline();
  // Undefined while on the deck list; null reviews every deck together.
  const [review, setReview] = useState<ReviewScope | undefined>(undefined);

  if (viewer === undefined) return <Loading />;
  if (viewer === null) {
    return (
      <Fallback
        title="Your session ended"
        description="Sign in again to keep studying."
        actionLabel="Sign in again"
        onAction={() => void authClient.signOut()}
      />
    );
  }

  if (review !== undefined && viewer.library) {
    return (
      <ReviewScreen
        // Remount per scope so each session starts fresh.
        key={review?.deckId ?? "all"}
        scope={review}
        now={now}
        online={online}
        onClose={() => setReview(undefined)}
      />
    );
  }

  return (
    <DecksScreen
      email={viewer.email}
      hasLibrary={Boolean(viewer.library)}
      now={now}
      online={online}
      onReview={setReview}
    />
  );
}

function Fallback({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fallback, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <NotebookBackground />
      <StatePanel icon={AlertTriangle} tone="warning" title={title} description={description}>
        <Button label={actionLabel} variant="outline" icon={LogOut} onPress={onAction} />
      </StatePanel>
    </View>
  );
}

/** Query failures surface here instead of unmounting the whole app. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorFallback onRetry={() => this.setState({ failed: false })} />
    );
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fallback, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <NotebookBackground />
      <StatePanel
        icon={AlertTriangle}
        tone="warning"
        title="Something went wrong"
        description="Armin couldn't load your library. Check your connection and try again. Your saved data is safe."
      >
        <Button label="Try again" variant="outline" onPress={onRetry} />
      </StatePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  fallback: { flex: 1, justifyContent: "center", paddingHorizontal: space.md },
});
