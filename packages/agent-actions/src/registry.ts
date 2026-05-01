import type { AdapterImpl } from "./types.js";

const adapters = new Map<string, AdapterImpl>();
const defaultAdapterSlugs = new Set(["pancakeswap-v3", "venus"]);

/** Register an adapter implementation in the in-process registry. */
export const registerAdapter = (impl: AdapterImpl): AdapterImpl => {
	adapters.set(impl.spec.slug, impl);
	return impl;
};

/** Look up an adapter by its stable slug. */
export const getAdapter = (slug: string): AdapterImpl | undefined => adapters.get(slug);

/** List all adapters registered in this Node.js process. */
export const listAdapters = (): AdapterImpl[] => Array.from(adapters.values());

/** List adapters that are safe to enable by default. */
export const listDefaultAdapters = (): AdapterImpl[] =>
	listAdapters().filter((impl) => impl.spec.tier === "default" || defaultAdapterSlugs.has(impl.spec.slug));
