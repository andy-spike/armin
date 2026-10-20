import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AuthLayout,
  authErrorMessage,
  Field,
  FormError,
  FormNotice,
} from "@/components/auth/auth-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setBusy(false);
    if (error) setError(authErrorMessage(error));
    else setSent(true);
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password. If you signed up with Google, this also adds a password to your account."
      footer={
        <Link to="/sign-in" className="font-medium text-accent hover:text-accent-deep">
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        {sent && (
          <FormNotice>
            If an account exists for {email}, a reset link is on its way.
          </FormNotice>
        )}
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
        <FormError message={error} />
        <Button type="submit" className="w-full" busy={busy}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
