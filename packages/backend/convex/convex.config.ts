import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import mcp from "@convex-dev/mcp/convex.config.js";
import resend from "@convex-dev/resend/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(resend);
app.use(mcp);

export default app;
