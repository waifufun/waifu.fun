import { clsx, type ClassValue } from "clsx";
import moment from "moment";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const abbreviateNumber = (num: number, withoutCurrency = false): string => {
	const absNum = Math.abs(Number(num));
	if (absNum < 1000) return formatNumber(num, false, withoutCurrency);

	const units = ["K", "M", "B", "T"];
	let exponent = Math.floor(Math.log10(absNum) / 3);
	if (exponent > units.length) exponent = units.length;
	const unit = units[exponent - 1];
	const scaled = absNum / 1000 ** exponent;
	const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

	return `${withoutCurrency ? "" : "$"}${(num < 0 ? "-" : "") + formatted + unit}`;
};

export const formatNumber = (num: number, showDecimals?: boolean, hideDollarSign?: boolean) => {
	const formatted = Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: showDecimals ? "standard" : "compact",
	}).format(num);

	if (hideDollarSign) {
		return formatted?.replace("$", "");
	}

	return formatted;
};

export const fromNow = (date: string | Date | number, hideAgo?: boolean): string => {
	const timeString = String(moment(date).fromNow());

	if (!hideAgo) {
		return timeString;
	}

	if (timeString.includes("a few seconds ago")) return "NOW";
	if (timeString.includes("a minute ago")) return "1m";
	if (timeString.includes("an hour ago")) return "1hr";
	if (timeString.includes("a day ago")) return "1d";
	if (timeString.includes("a week ago")) return "1w";
	if (timeString.includes("a month ago")) return "1mo";
	if (timeString.includes("a year ago")) return "1y";

	let result = timeString.replace("ago", "").trim();
	result = result.replace(" seconds", "s").replace(" second", "s");
	result = result.replace(" minutes", "m").replace(" minute", "m");
	result = result.replace(" hours", "hrs").replace(" hour", "hr");
	result = result.replace(" days", "d").replace(" day", "d");
	result = result.replace(" weeks", "w").replace(" week", "w");
	result = result.replace(" months", "mo").replace(" month", "mo");
	result = result.replace(" years", "y").replace(" year", "y");

	return result;
};

export const formatAddress = (str: string, length: number): string => {
	if (str.length <= length) return str;
	// ellipse in the middle of the string
	const start = str.slice(0, length / 2);
	const end = str.slice(str.length - length / 2);
	return `${start}...${end}`;
};
