import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { createAppDependencies } from "./lib/deps.js";
import { logger } from "./lib/logger.js";
import { failFastIfMisconfigured } from "./middleware/patron-auth.js";

// Boot-time misconfiguration guard. In production, refuses to start if the
// Steward HS256 secret or tenant id is missing. No-op outside production.
failFastIfMisconfigured();

const deps = createAppDependencies();
const app = createApp(deps, logger);

serve(
	{
		fetch: app.fetch,
		hostname: deps.config.app.host,
		port: deps.config.app.port,
	},
	(info) => {
		logger.info(
			{
				address: info.address,
				port: info.port,
				env: deps.config.app.env,
				compatibilityMode: deps.runtime.compatibilityMode,
			},
			"waifu api listening",
		);
	},
);
