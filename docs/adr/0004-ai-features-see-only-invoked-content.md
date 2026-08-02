# AI features only see study content the User invokes

Flashcard content is sent to the LLM provider only as the explicit input of an
AI feature the User runs (a generation, an explanation, an improvement). Armin
never exports a Study Space wholesale to the AI provider, never trains models on
user data, and never uses user content to improve shared AI outputs.

Consequences: the AI integration builds prompts from the specific card/deck the
User invoked and nothing more; the docs and privacy copy promise this boundary;
and any future "train on our data" or "analyze my whole study space" feature
would be a deliberate, documented reversal of this decision.
