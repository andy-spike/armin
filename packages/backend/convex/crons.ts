import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep unfinalized uploads", { hours: 6 }, internal.media.sweepOrphanBlobs, {});
crons.interval("forget old request ids", { hours: 24 }, internal.maintenance.pruneRequests, {});

crons.interval("cancel abandoned imports", { minutes: 15 }, internal.imports.sweep, {});
crons.interval("sweep agent Anki imports", { minutes: 15 }, internal.agentImports.sweep, {});

crons.interval("prune agent authorization and activity", { hours: 1 }, internal.agents.prune, {});

crons.interval("reset public reviewer data when due", { minutes: 5 }, internal.reviewer.reset, {});

crons.interval("prune rolling activity", { hours: 24 }, internal.performance.prune, {});

export default crons;
