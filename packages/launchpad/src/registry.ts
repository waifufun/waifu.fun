import type { LaunchpadAdapter, LaunchpadId } from "./types.js";

const adapters = new Map<LaunchpadId, LaunchpadAdapter>();

export const registerAdapter = (adapter: LaunchpadAdapter): LaunchpadAdapter => {
	adapters.set(adapter.descriptor.id, adapter);
	return adapter;
};

export const getAdapter = (id: LaunchpadId): LaunchpadAdapter | undefined => adapters.get(id);

export const listAll = (): LaunchpadAdapter[] => Array.from(adapters.values());

export const listLive = (): LaunchpadAdapter[] => listAll().filter((adapter) => adapter.descriptor.status === "live");

export const clearAdaptersForTest = (): void => {
	adapters.clear();
};
