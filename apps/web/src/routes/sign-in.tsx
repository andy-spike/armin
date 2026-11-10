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
  GoogleSignIn,
} from "@/components/auth/auth-layout";
import { authClient, safeRedirectPath } from "@/lib/auth-client";
import { useAuthFeatures } from "@/lib/session";

type SignInSearch = { reset?: boolean; deleted?: boolean; redirect?: string };

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    reset: search.reset === true || search.reset === "1" || search.reset === 1 ? true : undefined,
    deleted:
      search.deleted === true || search.deleted === "1" || search.deleted === 1 ? true : undefined,
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated && !search.reset && !search.deleted) {
      throw redirect({ href: search.redirect ?? "/" });
    }
  },
  head: () => ({ meta: [{ title: "Sign in · Armin" }] }),
  component: SignInPage,
});

function SignInPage() {
  const search = Route.useSearch();
  const features = useAuthFeatures();
  const redirectTo = search.redirect ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: redirectTo,
    });
    if (error) {
      setError(authErrorMessage(error, { emailAvailable: features.data?.email }));
      setBusy(false);
      return;
    }
    window.location.assign(redirectTo);
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Study your prerequisite-ordered decks from any device."
      footer={
        features.data?.signUpOpen === false ? undefined : (
          <>
            New to Armin?{" "}
            <Link to="/sign-up" className="font-medium text-accent hover:text-accent-deep">
              Create an account
            </Link>
          </>
        )
      }
    >
      <div className="space-y-4">
        {search.reset && <FormNotice>Password changed. Sign in with your new password.</FormNotice>}
        {search.deleted && <FormNotice>Your account and library were deleted.</FormNotice>}
        {features.data?.google && (
          <GoogleSignIn callbackURL={redirectTo} errorCallbackURL="/sign-in" onError={setError} />
        )}
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
