# Mobile development

For mobile UI or interaction changes, read `README.md` in this directory and
verify the affected screen or flow in the running Android app before finishing.

- In T3, use `device_list` and `device_open` to select an Android emulator, then
  use the returned `agent-device` command and target arguments. This lets the
  user watch the same device in the Device panel.
- Outside T3, use the local `agent-device` CLI. Read `agent-device help workflow`
  and discover devices before opening an app. See the Android emulator section
  of this directory's README for setup and launch commands.
- Keep Metro running while editing. After Fast Refresh, inspect a screenshot
  for appearance and use UI snapshots and interactions to verify behavior.
  Prefer current element refs, accessibility labels, and test IDs for actions.
- Fix observed problems and verify the final code on the device. Report the
  device and flows checked, with screenshot evidence when useful. If runtime
  verification is unavailable, state the blocker and which checks did run.
