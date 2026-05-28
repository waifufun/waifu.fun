export * from "./types.js";
export * from "./registry.js";
export * from "./platform-cut.js";
export * from "./launch-template.js";
export * from "./adapters/bankr/index.js";
export * from "./adapters/bags/index.js";
export * from "./adapters/four-meme/regular.js";
export * from "./adapters/four-meme/tax-token.js";
export * from "./adapters/flap/placeholder.js";
export * from "./adapters/coming-soon/index.js";

import { bagsAdapter } from "./adapters/bags/index.js";
import { bankrAdapter } from "./adapters/bankr/index.js";
import { comingSoonAdapters } from "./adapters/coming-soon/index.js";
import { flapAdapterPlaceholder } from "./adapters/flap/placeholder.js";
import { fourMemeRegularAdapter } from "./adapters/four-meme/regular.js";
import { fourMemeTaxTokenAdapter } from "./adapters/four-meme/tax-token.js";
import { getAdapter, registerAdapter } from "./registry.js";
import type { LaunchpadAdapter } from "./types.js";

export const defaultLaunchpadAdapters: LaunchpadAdapter[] = [
	fourMemeRegularAdapter,
	fourMemeTaxTokenAdapter,
	flapAdapterPlaceholder,
	bagsAdapter,
	bankrAdapter,
	...comingSoonAdapters,
];

for (const adapter of defaultLaunchpadAdapters) {
	if (!getAdapter(adapter.descriptor.id)) registerAdapter(adapter);
}
