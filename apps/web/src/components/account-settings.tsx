import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { Row, Section } from "@/components/settings-layout";
import { GoogleIcon } from "@/components/auth/auth-layout";
import { armin, errorMessage } from "@/lib/armin-client";
import { authClient } from "@/lib/auth-client";
import { useAuthFeatures, useViewer } from "@/lib/session";

function timeZoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf(
      "timeZone",
    );
  } catch {
    zones = [];
  }
  if (!zones.includes("UTC")) zones = ["UTC", ...zones];
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export function AccountSettings() {
  const toast = useToast();
  const viewer = useViewer();
  const accounts = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const features = useAuthFeatures();
  const providers = new Set((accounts.data ?? []).map((account) => account.providerId));
  const hasPassword = providers.has("credential");
  const hasGoogle = providers.has("google");
  const googleAvailable = features.data?.google === true;

  const timeZone = viewer.data?.library?.timeZone ?? "UTC";
  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const setTimeZone = useMutation({
    mutationFn: (zone: string) => armin.settings.setTimeZone(zone),
    onSuccess: (zone) => toast({ tone: "success", title: "Time zone saved", description: zone }),
    onError: (error) =>
      toast({ tone: "error", title: "Couldn't save time zone", description: errorMessage(error) }),
  });

  const signOutOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast({ tone: "success", title: "Signed out of other devices" }),
    onError: () => toast({ tone: "error", title: "Couldn't sign out other devices" }),
  });

  const linkGoogle = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.linkSocial({
        provider: "google",
        callbackURL: "/settings",
      });
      if (error) throw new Error(error.message || "Couldn't start Google sign-in.");
    },
    onError: (error) =>
      toast({ tone: "error", title: "Couldn't link Google", description: errorMessage(error) }),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Section title="Account" description="Your sign-in details. One account owns one private library.">
        <Row label="Email" hint={viewer.data?.name || undefined}>
          <span className="max-w-[14rem] truncate text-sm text-ink">{viewer.data?.email}</span>
        </Row>
        <Row
          label="Google"
          hint={
            hasGoogle
              ? "Linked. You can sign in with Google."
              : googleAvailable || features.isLoading
                ? "Link Google to sign in with it. It must use this same verified email."
                : "Google sign-in isn't configured for this deployment."
          }
        >
          {hasGoogle ? (
            <span className="text-sm text-muted">Linked</span>
          ) : googleAvailable ? (
            <Button
              variant="outline"
              size="sm"
              busy={linkGoogle.isPending}
              disabled={accounts.isLoading}
              onClick={() => linkGoogle.mutate()}
            >
              <GoogleIcon /> Link
            </Button>
          ) : features.isLoading ? (
            <Button variant="outline" size="sm" disabled>
              <GoogleIcon /> Link
            </Button>
          ) : (
            <span className="text-sm text-muted">Not configured</span>
          )}
        </Row>
        <Row
          label="Password"
          hint={
            hasPassword
              ? "You can sign in with email and password."
              : "Add a password by requesting a reset link for your email."
          }
          last
        >
          <Link to="/forgot-password">
            <Button variant="outline" size="sm">
              {hasPassword ? "Reset" : "Add password"}
            </Button>
          </Link>
        </Row>
      </Section>

      <Section
        title="Study day"
        description="Your time zone decides when a study day starts and when the daily new-card limit resets."
      >
        <Row
          label="Time zone"
          hint={detected && detected !== timeZone ? `This device is in ${detected}.` : undefined}
          last
        >
          <select
            aria-label="Time zone"
            className="h-8 max-w-[12rem] rounded-md border border-border-strong bg-surface px-2 text-sm text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-tint"
            value={timeZone}
            disabled={setTimeZone.isPending}
            onChange={(event) => setTimeZone.mutate(event.target.value)}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title="Sessions" description="Signing out ends access on that device immediately.">
        <Row label="This device">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void authClient.signOut().finally(() => window.location.assign("/sign-in"))
            }
          >
            Sign out
          </Button>
        </Row>
        <Row label="Other devices" last>
          <Button
            variant="outline"
            size="sm"
            busy={signOutOthers.isPending}
            onClick={() => signOutOthers.mutate()}
          >
            Sign out others
          </Button>
        </Row>
      </Section>

      <Section
        title="Delete account"
        description="Permanently delete your account, library, review history, and images. Export first if you want a copy."
      >
        <Row label="Delete account and library" last>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete…
          </Button>
        </Row>
      </Section>

      <DeleteAccountDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        needsPassword={hasPassword}
      />
    </>
  );
}

function DeleteAccountDialog({
  open,
  onClose,
  needsPassword,
}: {
  open: boolean;
  onClose: () => void;
  needsPassword: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = confirmText.trim().toUpperCase() === "DELETE" && (!needsPassword || password);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.deleteUser(needsPassword ? { password } : {});
    if (error) {
      setBusy(false);
      setError(
        error.code === "SESSION_EXPIRED" || /fresh|expired/i.test(error.message ?? "")
          ? "For safety, sign out and sign in again, then delete within a day of signing in."
          : error.code === "INVALID_PASSWORD"
            ? "That password is incorrect."
            : error.message || "Couldn't delete the account.",
      );
      return;
    }
    window.location.assign("/sign-in?deleted=1");
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Delete account"
      description="This removes your account and every deck, flashcard, review, and image. It can't be undone."
    >
      <div className="space-y-4">
        {needsPassword && (
          <div className="space-y-1.5">
            <label htmlFor="delete-password" className="block text-sm font-medium">
              Password
            </label>
            <PasswordInput
              id="delete-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="delete-confirm" className="block text-sm font-medium">
            Type DELETE to confirm
          </label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-again">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" busy={busy} disabled={!ready} onClick={submit}>
            Delete account
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
