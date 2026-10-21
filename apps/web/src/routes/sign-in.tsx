import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  AuthLayout,
  authErrorMessage,
  Field,
  FormError,
  FormNotice,
  GoogleIcon,
} from "@/components/auth/auth-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { reset?: boolean; deleted?: boolean } => ({
    reset: search.reset === "1" || search.reset === 1 ? true : undefined,
    deleted: search.deleted === "1" || search.deleted === 1 ? true : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (context.isAuthenticated) throw redirect({ to: "/" });
  },
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/",
    });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    window.location.assign("/");
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });
    if (error) {
      setError(authErrorMessage(error));
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Study your prerequisite-ordered decks from any device."
      footer={
        <>
          New to Armin?{" "}
          <Link to="/sign-up" className="font-medium text-accent hover:text-accent-deep">
            Create an account
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {search.reset && <FormNotice>Password changed. Sign in with your new password.</FormNotice>}
        {search.deleted && <FormNotice>Your account and library were deleted.</FormNotice>}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={signInWithGoogle}
          busy={googleBusy}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-faint">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" busy={busy}>
            Sign in
          </Button>
        </form>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="text-muted hover:text-ink">
            Forgot password?
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
