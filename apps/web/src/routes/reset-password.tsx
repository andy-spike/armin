import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, authErrorMessage, Field, FormError } from "@/components/auth/auth-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token || linkError) {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links work once and expire after an hour. Request a new one."
      >
        <Link to="/forgot-password">
          <Button className="w-full">Request a new link</Button>
        </Link>
      </AuthLayout>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setError(authErrorMessage(error));
      setBusy(false);
      return;
    }
    window.location.assign("/sign-in?reset=1");
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="This signs out your other sessions.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" busy={busy}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
