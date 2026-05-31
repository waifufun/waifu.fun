import { Hono } from "hono";
import adapterTemplateRoutes from "./adapter-templates.js";
import adminAgentRoutes from "./admin-agents.js";
import agentHoldingsRoutes from "./agent-holdings.js";
import agentLaunchRoutes from "./agent-launches.js";
import agentNavHistoryRoutes from "./agent-nav-history.js";
import agentPolicyRoutes from "./agent-policies.js";
import agentPullRoutes from "./agent-pull.js";
import agentWalletRoutes from "./agent-wallets.js";
import agentErc8004Routes from "./agents-erc8004.js";
import agentEventsRoutes from "./agents-events.js";
import agentRuntimeRoutes from "./agents-runtime.js";
import agentTwitterStatsRoutes from "./agents-twitter-stats.js";
import agentTwitterTweetsRoutes from "./agents-twitter-tweets.js";
import agentXRoutes from "./agents-x.js";
import agentRoutes from "./agents.js";
import agentBurnRateRoutes from "./agents/burn-rate.js";
import agentHyperliquidRoutes from "./agents/hyperliquid.js";
import appRoutes from "./apps.js";
import authSiweRoutes from "./auth-siwe.js";
import blinkRoutes from "./blinks.js";
import bundleRoutes from "./bundles.js";
import claimRoutes from "./claim.js";
import launchAuthorizeRoutes from "./launches-authorize.js";
import launchRoutes from "./launches.js";
import patronRoutes from "./patron-me.js";
import stakingRoutes from "./staking.js";
import topupRoutes from "./topup.js";
import userLaunchRoutes from "./user-launches.js";
import webhookRoutes from "./webhooks.js";

const v2 = new Hono();

// IMPORTANT: sub-routers using app.use("*") swallow all routes mounted at the same path.
// Scope wildcard middleware to specific path patterns.

v2.route("/staking", stakingRoutes);
v2.route("/auth/siwe", authSiweRoutes);
v2.route("/adapters", adapterTemplateRoutes);
v2.route("/admin/agents", adminAgentRoutes);
v2.route("/bundles", bundleRoutes);
v2.route("/", appRoutes);

// W42 LaunchFactory routes mount FIRST under /v2/launches so POST /v2/launches
// and the UUID-shaped GET /v2/launches/:id (+ depositors/preview) resolve to
// the new agent_launches table. Legacy authorize/prepare routes still mount
// on the same prefix and serve all other patterns (POST /:id/authorize, etc.).
v2.route("/launches", agentLaunchRoutes);
v2.route("/launches", launchAuthorizeRoutes);

// claim routes mount BEFORE agents so /v2/agents/claim/:token and
// /v2/agents/prepare take precedence over the catch-all /:token handler
// in agents.ts. blinkRoutes follows the same discipline so
// /v2/agents/:tokenAddress/blink resolves before the /:token catch-all.
v2.route("/agents", claimRoutes);
v2.route("/agents", blinkRoutes);
v2.route("/agents", agentPolicyRoutes);
v2.route("/agents", agentPullRoutes);
v2.route("/agents", agentEventsRoutes);
v2.route("/agents", agentXRoutes);
v2.route("/agents", agentRuntimeRoutes);
v2.route("/agents", agentWalletRoutes);
v2.route("/agents", agentHoldingsRoutes);
v2.route("/agents", agentNavHistoryRoutes);
v2.route("/agents", agentBurnRateRoutes);
v2.route("/agents", agentHyperliquidRoutes);
v2.route("/agents", agentTwitterStatsRoutes);
v2.route("/agents", agentTwitterTweetsRoutes);
v2.route("/agents", agentErc8004Routes);
// Topup routes mount before agentRoutes so /v2/agents/:address/topup/* resolves
// here before the catch-all /:token handler in agents.ts.
v2.route("/agents", topupRoutes);
v2.route("/agents", agentRoutes);
v2.route("/launches", launchRoutes);
v2.route("/users", userLaunchRoutes);
v2.route("/patron", patronRoutes);
v2.route("/webhooks", webhookRoutes);

export default v2;
