import type { Metadata } from "next";
import Script from "next/script";
import "@/styles/index.css";

export const metadata: Metadata = {
  title: "Armin",
  description:
    "Hierarchical spaced-repetition flashcards. Learn prerequisites first.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}
