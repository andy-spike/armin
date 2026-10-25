import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import privacy from "@/content/legal/privacy.md?raw";

export const Route = createFileRoute("/privacy")({
  // Public and crawlable: the server renders the policy rather than a client shell.
  ssr: true,
  head: () => ({
    meta: [
      { title: "Privacy Policy · Armin" },
      {
        name: "description",
        content:
          "What personal data Armin handles, why, how long it is kept, and the rights you have over it.",
      },
    ],
  }),
  component: () => <LegalPage source={privacy} />,
});
