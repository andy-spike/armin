# Content conflicts require explicit resolution

Competing edits and edit-versus-delete operations based on the same older record
version follow the same rule as reviews: accept the first change and reject the
competing change. Clients preserve the rejected edit for resolution instead of
silently overwriting accepted data or introducing automatic merge rules.
