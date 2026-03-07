import devnetWaifufunIdl from "../idls/devnet/waifufun.json";
import devnetWaifufunLegacyIdl from "../idls/devnet/waifufun-legacy.json";
import mainnetWaifufunIdl from "../idls/mainnet/waifufun.json";
import mainnetWaifufunLegacyIdl from "../idls/mainnet/waifufun-legacy.json";

export { devnetWaifufunIdl, devnetWaifufunLegacyIdl, mainnetWaifufunIdl, mainnetWaifufunLegacyIdl };

export type { Autofun as DevnetWaifufun } from "../types/devnet/waifufun";
export type { AutofunLegacy as DevnetWaifufunLegacy } from "../types/devnet/waifufun-legacy";
export type { Autofun as MainnetWaifufun } from "../types/mainnet/waifufun";
export type { AutofunLegacy as MainnetWaifufunLegacy } from "../types/mainnet/waifufun-legacy";

export const WAIFUFUN_PROGRAM_ADDRESSES = {
	mainnet: mainnetWaifufunIdl.address,
	devnet: devnetWaifufunIdl.address,
} as const;

export const WAIFUFUN_LEGACY_PROGRAM_ADDRESSES = {
	mainnet: mainnetWaifufunLegacyIdl.address,
	devnet: devnetWaifufunLegacyIdl.address,
} as const;

export const WAIFUFUN_INSTRUCTIONS = [
	"accept_authority",
	"configure",
	"launch",
	"launch_and_swap",
	"nominate_authority",
	"set_max_amounts",
	"swap",
	"withdraw",
] as const;

export type WaifufunInstruction = (typeof WAIFUFUN_INSTRUCTIONS)[number];

export const AUDITED_SOURCE_REPOSITORY = "https://github.com/elizaOS/Auto-Fun-SC-Audit";
export const AUDITED_SOURCE_COMMIT = "68cab345e6e21ff799b07d2317e9673d64ad06bc";
