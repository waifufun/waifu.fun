import type { IPresale } from "@autofun/types";

export type StatusBadgeInfo = {
	text: string;
	color: string;
};

export const getStatusBadge = (status: string): StatusBadgeInfo => {
	switch (status) {
		case "active":
			return { text: "LIVE", color: "bg-green-500/90 text-black border-green-700" };
		case "draft":
			return { text: "DRAFT", color: "bg-gray-500/90 text-white border-gray-700" };
		case "paused":
			return { text: "PAUSED", color: "bg-yellow-500/90 text-black border-yellow-700" };
		case "completed":
			return { text: "COMPLETED", color: "bg-blue-500/90 text-white border-blue-700" };
		case "cancelled":
			return { text: "CANCELLED", color: "bg-red-500/90 text-white border-red-700" };
		case "failed":
			return { text: "FAILED", color: "bg-red-500/90 text-white border-red-700" };
		default:
			return { text: "UNKNOWN", color: "bg-gray-500/90 text-white border-gray-700" };
	}
};

export const getCardAccentTheme = (presale: IPresale): "gold" | "orange" | "purple" | "blue" | "gray" | "green" => {
	const useGoldTheme = presale?.featured;
	const useOrangeTheme = presale?.status === "paused";
	const useGrayTheme = presale?.status === "draft";
	const useBlueTheme = presale?.verified === true;
	const usePurpleTheme = presale?.status === "active" && !useBlueTheme;

	return useGoldTheme
		? "gold"
		: useOrangeTheme
			? "orange"
			: useGrayTheme
				? "gray"
				: usePurpleTheme
					? "purple"
					: useBlueTheme
						? "blue"
						: "green";
};

export const getAccentColorClasses = (theme: "gold" | "orange" | "purple" | "blue" | "gray" | "green") => {
	switch (theme) {
		case "gold":
			return {
				border: "border-amber-400/50",
				text: "text-amber-400 filter drop-shadow-[1px_1px_0px_black]",
				textHover: "group-hover:text-amber-400",
				textMuted: "text-amber-400/80 group-hover:text-amber-400",
			};
		case "orange":
			return {
				border: "border-orange-400/50",
				text: "text-orange-400",
				textHover: "group-hover:text-orange-400",
				textMuted: "text-orange-400/80 group-hover:text-orange-400",
			};
		case "gray":
			return {
				border: "border-gray-400/50",
				text: "text-gray-400",
				textHover: "group-hover:text-gray-400",
				textMuted: "text-gray-400/80 group-hover:text-gray-400",
			};
		case "blue":
			return {
				border: "border-sky-400/50",
				text: "text-sky-400",
				textHover: "group-hover:text-sky-400",
				textMuted: "text-sky-400/80 group-hover:text-sky-400",
			};
		case "purple":
			return {
				border: "border-purple-500/50",
				text: "text-purple-400",
				textHover: "group-hover:text-purple-400",
				textMuted: "text-purple-400/80 group-hover:text-purple-400",
			};
		default: // green
			return {
				border: "border-[#03FF24]/50",
				text: "group-hover:text-[#03FF24]",
				textHover: "group-hover:text-[#03FF24]",
				textMuted: "text-[#03FF24]/70 group-hover:text-[#03FF24]/90",
			};
	}
};

// Shared badge styling constants
export const BADGE_BASE_CLASSES = "font-bold uppercase tracking-wider rounded-none text-xs px-2.5 py-1";
export const BADGE_ICON_CLASSES = "h-3 w-3 mr-1 pixelated-icon";

// Card-specific badge classes (smaller for cards)
export const CARD_BADGE_BASE_CLASSES =
	"font-bold uppercase tracking-wider rounded-none text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1";
export const CARD_BADGE_ICON_CLASSES = "h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 pixelated-icon";
