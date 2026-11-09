import { errorMessage, StaleError } from "@/lib/armin-client";

type Toast = (input: {
  title: string;
  description?: string;
  tone?: "default" | "success" | "error";
}) => void;

export function notifySaveError(toast: Toast, title: string, error: unknown) {
  if (error instanceof StaleError) {
    toast({
      tone: "error",
      title: "Not saved: changed elsewhere",
      description: `${error.message} Your draft is still open; copy what you need, then close and reopen to edit the latest version.`,
    });
    return;
  }
  toast({ tone: "error", title, description: errorMessage(error) });
}
