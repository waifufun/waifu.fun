import { getConfig } from "../compat/config.js";
import { createDbClient } from "../compat/db.js";
import { createFlapClient } from "../services/flap-client.js";

import type { AppDependencies } from "../contracts/services.js";

export function createAppDependencies(): AppDependencies {
	const config = getConfig();
	const usingMemoryDb = process.env.DB_COMPAT === "memory";
	const db = createDbClient(config);

	return {
		config,
		db,
		flap: createFlapClient(config),
		runtime: {
			startedAt: new Date().toISOString(),
			compatibilityMode: usingMemoryDb ? "local-compat" : "real-db",
			notes: usingMemoryDb
				? ["DB_COMPAT=memory enabled; using in-memory compatibility repository."]
				: ["Using real Drizzle/Postgres database."],
		},
	};
}
