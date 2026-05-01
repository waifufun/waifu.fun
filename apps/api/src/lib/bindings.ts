import type { Logger } from "pino";
import type { AuthPrincipal } from "../contracts/auth.js";
import type { AppDependencies } from "../contracts/services.js";

export type AppBindings = {
	Variables: {
		auth: AuthPrincipal | null;
		deps: AppDependencies;
		requestId: string;
		logger: Logger;
	};
};
