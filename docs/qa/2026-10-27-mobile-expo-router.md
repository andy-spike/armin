# Expo Router mobile smoke walkthrough

- Environment: Android emulator `Armin_Pixel_7_API_36`, Expo Go, isolated local Convex deployment.
- Signed in with the worktree sample account and confirmed the seeded deck and review queue loaded.
- Revealed an answer, rated it Good, and confirmed the next card appeared and the due count decreased.
- Undid the review and confirmed the original card and due count returned.
- Relaunched after updating the Expo SDK patch packages; the session, deck, and review queue loaded again.
- Android and iOS JavaScript bundle exports passed. iOS runtime was not checked.
