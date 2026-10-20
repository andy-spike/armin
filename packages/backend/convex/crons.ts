import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("sweep unfinalized uploads", { hours: 6 }, internal.media.sweepOrphanBlobs, {});
crons.interval("forget old request ids", { hours: 24 }, internal.maintenance.pruneRequests, {});

export default crons;
