const DECKS = [
  { name: "HTTP & the web", due: 12 },
  { name: "French — passé composé", due: 4 },
  { name: "Linear algebra", due: 0 },
];

export function DecksDemo() {
  return (
    <div className="w-full max-w-xl">
      <div className="rounded-xl border border-ui-2 bg-paper">
        <div className="flex items-center justify-between border-b border-ui px-6 py-3">
          <span className="text-sm font-medium text-ink">Decks</span>
          <span className="font-mono text-xs text-muted">
            3 decks · 16 due
          </span>
        </div>
        <ul className="divide-y divide-ui">
          {DECKS.map((deck) => (
            <li
              key={deck.name}
              className="flex items-center justify-between px-6 py-3.5"
            >
              <span className="font-serif text-lg font-semibold tracking-tight text-ink">
                {deck.name}
              </span>
              {deck.due > 0 ? (
                <span className="font-mono text-sm text-accent">
                  {deck.due} due
                </span>
              ) : (
                <span className="font-mono text-sm text-muted">
                  all caught up
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center font-mono text-xs text-muted">
        ruled rows, serif names, due counts in mono
      </p>
    </div>
  );
}
