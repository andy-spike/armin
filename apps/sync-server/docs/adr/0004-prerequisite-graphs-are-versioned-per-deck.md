# Prerequisite graphs are versioned per Deck

Independent offline edits can each be valid while forming a cycle when combined.
The first server therefore treats each Deck's prerequisite graph as one
versioned record, validates the complete submitted graph, and rejects edits
based on an older graph version. This can reject compatible edits, but avoids
implementing an automatic graph merge.
