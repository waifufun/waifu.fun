import {
	devnetAutofun,
	devnetAutofunLegacy,
	mainnetAutofun,
	mainnetAutofunLegacy,
	type DevnetAutofun,
	type DevnetAutofunLegacy,
	type MainnetAutofun,
	type MainnetAutofunLegacy,
} from "@waifufun/programs";

export const devnetWaifufunIdl = devnetAutofun;
export const devnetWaifufunLegacyIdl = devnetAutofunLegacy;
export const mainnetWaifufunIdl = mainnetAutofun;
export const mainnetWaifufunLegacyIdl = mainnetAutofunLegacy;

export type DevnetWaifufun = DevnetAutofun;
export type DevnetWaifufunLegacy = DevnetAutofunLegacy;
export type MainnetWaifufun = MainnetAutofun;
export type MainnetWaifufunLegacy = MainnetAutofunLegacy;

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
