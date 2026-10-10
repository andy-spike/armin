# Armin sync server

Placeholder for the optional cloud sync service that saves a learner's progress
off-device so it can be restored or shared between the desktop and mobile apps.
The server stack and the sync model have not been chosen yet.

When the protocol between clients and this server takes shape, put the shared
request/response types in a package under `packages/` rather than importing
client code here.

This folder has no `package.json` yet, so it is not a workspace project. Add one
with the chosen stack's dependencies to register it with pnpm and Turborepo.
