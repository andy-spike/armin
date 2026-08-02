# Keybindings are per-User overrides layered on factory defaults

The effective keymap is `factory ◁ User override`. **Factory defaults** are
hardcoded constants in code — the single source of default bindings. A User
persists only the bindings they actually changed, as a small JSON **override
diff** stored in their settings. Rebinding in the Keyboard settings page only ever
edits the current User; per-Command reset drops that key from the diff and
reset-all clears it, both reverting to factory.

Keeping the override as a diff (rather than a full snapshot of every binding)
means Commands added or default keys corrected in a later app version reach
existing Users automatically instead of being frozen at the version the User last
saved on. Keybindings ride along with the User's study data, consistent with one
User owning one Study Space.
