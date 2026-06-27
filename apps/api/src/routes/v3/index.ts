import type { Database } from "@waifufun/db";
import { Hono } from "hono";

import { createV3AgentRoutes } from "./agents.js";
import createLaunchpadRoutes from "./launchpads.js";
import { createV3PatronRoutes } from "./patron.js";
import { createV3ReconciliationRoutes } from "./reconciliation.js";
import { createV3WaitlistRoutes } from "./waitlist.js";

export type V3RouteOptions = Parameters<typeof createV3AgentRoutes>[0] & { db?: Database };

export function createV3Routes(options?: V3RouteOptions) {
	const v3 = new Hono();
	v3.route("/agents", createV3AgentRoutes(options));
	v3.route("/launchpads", createLaunchpadRoutes());
	v3.route("/patron", createV3PatronRoutes());
	v3.route("/reconciliation", createV3ReconciliationRoutes());
	v3.route("/", createV3WaitlistRoutes(options));
	return v3;
}

export default createV3Routes();
