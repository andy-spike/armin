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

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context }) => {
    if (context.isAuthenticated) throw redirect({ to: "/" });
  },
  component: SignUpPage,
});

function SignUpPage() {
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
      callbackURL: "/",
    });
    setBusy(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    setSentTo(email);
  };

  const resend = async () => {
    if (!sentTo) return;
    setResent(false);
    const { error } = await authClient.sendVerificationEmail({ email: sentTo, callbackURL: "/" });
    if (error) setError(authErrorMessage(error));
    else setResent(true);
  };

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={
          <>
            We sent a verification link to <strong className="text-ink">{sentTo}</strong>.
            Open it to finish creating your account.
          </>
        }
        footer={
          <Link to="/sign-in" className="font-medium text-accent hover:text-accent-deep">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          {resent && <FormNotice>Sent another link.</FormNotice>}
          <FormError message={error} />
          <Button variant="outline" className="w-full" onClick={resend}>
            Resend verification email
          </Button>
        </div>
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
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            void authClient.signIn.social({
              provider: "google",
              callbackURL: "/",
              errorCallbackURL: "/sign-up",
            })
          }
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
