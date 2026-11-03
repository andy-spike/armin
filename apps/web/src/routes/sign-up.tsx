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

type SignUpSearch = { redirect?: string };

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>): SignUpSearch => ({
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.isAuthenticated) throw redirect({ href: search.redirect ?? "/" });
  },
  head: () => ({ meta: [{ title: "Create account · Armin" }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const search = Route.useSearch();
  const features = useAuthFeatures();
  const redirectTo = search.redirect ?? "/";
  const signUpClosed = features.data?.signUpOpen === false;
  const emailUnavailable = features.data?.email === false;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: name.trim() || email.split("@")[0],
      email,
      password,
      callbackURL: redirectTo,
    });
    if (error) {
      setBusy(false);
      setError(authErrorMessage(error));
      return;
    }
    setBusy(false);
    setSentTo(email);
  };

  const resend = async () => {
    if (!sentTo) return;
    setResent(false);
    const { error } = await authClient.sendVerificationEmail({
      email: sentTo,
      callbackURL: redirectTo,
    });
    if (error) setError(authErrorMessage(error));
    else setResent(true);
  };

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          <>
            If this email can be used to create an account, we&apos;ve sent a verification link to{" "}
            <strong className="text-ink">{sentTo}</strong>. Open it to finish creating your account.
          </>
        }
        footer={
          <Link to="/sign-in" className="font-medium text-accent hover:text-accent-deep">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          {resent && (
            <FormNotice>
              If a verification email can be sent, we&apos;ve sent another one.
            </FormNotice>
          )}
          <FormError message={error} />
          <Button variant="outline" className="w-full" onClick={resend}>
            Resend verification email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (signUpClosed) {
    return (
      <AuthLayout
        title="Sign-up is closed"
        subtitle="This personal Armin instance has one account, created on its server."
        footer={
          <Link to="/sign-in" className="font-medium text-accent hover:text-accent-deep">
            Back to sign in
          </Link>
        }
      >
        <FormNotice>
          To use Armin yourself, self-host your own instance or sign up at armincards.app.
        </FormNotice>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your library is private to your account."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-medium text-accent hover:text-accent-deep">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {features.data?.google && (
          <GoogleSignIn callbackURL={redirectTo} errorCallbackURL="/sign-up" onError={setError} />
        )}
        {emailUnavailable && (
          <FormNotice>
            Email isn&apos;t available right now, so new accounts can&apos;t be created. Contact
            support.
          </FormNotice>
        )}
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
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
          <Field label="Password" htmlFor="password" hint="At least 10 characters.">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" busy={busy}>
            Create account
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
