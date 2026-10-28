import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AI_SETUP_PLATFORMS,
  AiSetupGuide,
  type AiSetupPlatform,
} from "@/components/ai-setup-guide";

type AiSetupSearch = { platform?: AiSetupPlatform };

function isPlatform(value: unknown): value is AiSetupPlatform {
  return AI_SETUP_PLATFORMS.includes(value as AiSetupPlatform);
}

function AiSetupPage() {
  const navigate = useNavigate();
  const { platform } = Route.useSearch();

  return (
    <div className="pb-24">
      <header className="mb-10">
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">AI setup</h1>
        <p className="mt-1.5 text-sm text-muted">
          Connect your AI assistant so it can make cards for you.
        </p>
      </header>
      <AiSetupGuide
        platform={platform ?? "claude"}
        onPlatformChange={(next) =>
          // Switching guides is a view change, not a navigation step.
          void navigate({ to: "/ai-setup", search: { platform: next }, replace: true })
        }
      />
    </div>
  );
}

export const Route = createFileRoute("/_app/ai-setup")({
  validateSearch: (search: Record<string, unknown>): AiSetupSearch => ({
    platform: isPlatform(search.platform) ? search.platform : undefined,
  }),
  head: () => ({ meta: [{ title: "AI setup · Armin" }] }),
  component: AiSetupPage,
});
