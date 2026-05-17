import type { LaunchpadId } from "@/lib/launchpad/types";

type ComingSoonCopy = {
	label: string;
	readiness: string;
	modalTitle: string;
	modalIntro: string;
	creatorReasons: string[];
	waitlistHelper: string;
};

const DEFAULT_COPY: ComingSoonCopy = {
	label: "adapter planned",
	readiness: "join the waitlist to help prioritize adapter work.",
	modalTitle: "adapter waitlist",
	modalIntro:
		"This route is planned for creators who want waifu.fun to prepare launch payloads outside the current live rails.",
	creatorReasons: [
		"Tell us which launch rail your community already uses.",
		"Get notified when the adapter is ready for test launches.",
		"Help us keep the picker neutral across launchpad ecosystems.",
	],
	waitlistHelper: "We only use this email for adapter availability and private test invites.",
};

export const COMING_SOON_COPY: Partial<Record<LaunchpadId, ComingSoonCopy>> = {
	"four-meme-tax": {
		label: "paused for launch",
		readiness: "parallel four.meme route is paused while FLAP is the primary launch rail.",
		modalTitle: "four.meme tax waitlist",
		modalIntro:
			"The four.meme tax route is paused while we focus on FLAP as the primary BSC launch rail. Join the waitlist and we will notify you when this path is re-enabled.",
		creatorReasons: [
			"You want a configurable trade tax split across treasury, holders, burn, and LP.",
			"You need the four.meme route specifically for compatibility with your community.",
			"You can help us validate the parallel adapter before we re-enable it.",
		],
		waitlistHelper: "We will email when the four.meme tax route is re-enabled.",
	},
	"four-meme-regular": {
		label: "paused for launch",
		readiness: "parallel four.meme route is paused while FLAP is the primary launch rail.",
		modalTitle: "four.meme regular waitlist",
		modalIntro:
			"The four.meme regular route is paused while we focus on FLAP as the primary BSC launch rail. Join the waitlist and we will notify you when this path is re-enabled.",
		creatorReasons: [
			"You want the simplest bonding curve with no creator-side tax.",
			"You need the four.meme route specifically for compatibility with your community.",
			"You can help us validate the parallel adapter before we re-enable it.",
		],
		waitlistHelper: "We will email when the four.meme regular route is re-enabled.",
	},
	"pump-fun": {
		label: "solana demand track",
		readiness: "made for creators with an existing Solana audience.",
		modalTitle: "pump.fun waitlist",
		modalIntro:
			"Pump.fun support is planned for creators who want a Solana-native launch while still using waifu.fun for agent identity, treasury setup, and runtime coordination.",
		creatorReasons: [
			"Your holders already live on Solana and expect a pump.fun style curve.",
			"You want agent setup handled before the token route opens.",
			"You can help us test wallet, migration, and metadata edge cases.",
		],
		waitlistHelper: "Join if pump.fun is the rail your community will actually use.",
	},
	bags: {
		label: "creator rewards track",
		readiness: "built for creators who care about attribution and reward routing.",
		modalTitle: "bags waitlist",
		modalIntro:
			"Bags support is planned for creators who want Solana distribution with creator reward mechanics while keeping the agent layer portable.",
		creatorReasons: [
			"You want creator reward routing to matter from day one.",
			"You need Solana launch mechanics without giving up the waifu.fun agent workflow.",
			"You can validate how revenue splits should surface in the wizard.",
		],
		waitlistHelper: "Join if reward attribution is central to your launch plan.",
	},
	"custom-evm": {
		label: "adapter sdk track",
		readiness: "for teams bringing their own launch contract or venue.",
		modalTitle: "custom adapter waitlist",
		modalIntro:
			"Custom adapter support is planned for teams that need waifu.fun to prepare payloads for a launch rail we do not operate directly.",
		creatorReasons: [
			"You already have a contract, launch venue, or chain requirement.",
			"You need the agent identity and treasury flow without a preset market route.",
			"You want early input on the adapter SDK shape.",
		],
		waitlistHelper: "Join if you can share a concrete adapter requirement with the team.",
	},
};

export function getComingSoonCopy(id: LaunchpadId): ComingSoonCopy {
	return COMING_SOON_COPY[id] ?? DEFAULT_COPY;
}
