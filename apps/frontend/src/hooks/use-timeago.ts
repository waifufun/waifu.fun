"use client";
import { fromNow } from "@/lib/utils";
import moment from "moment";
import { useCallback, useEffect, useState } from "react";

export default function useTimeAgo({ date }: { date: Date | string | number }) {
	const [timeAgo, setTimeAgo] = useState<string>();

	const formatTime = useCallback(() => {
		const now = moment();
		const dateToCheck = moment(date);
		const diffSecs = now.diff(dateToCheck, "seconds");

		if (diffSecs > 59) {
			return setTimeAgo(fromNow(date, true));
		}

		return setTimeAgo(`${diffSecs}s`);
	}, [date]);
	useEffect(() => {
		// One <TimeAgo> is rendered per trade row, so a busy token page spins up
		// dozens of 1s timers. Skip the tick while the tab is hidden and catch up
		// on visibilitychange instead of re-rendering every row every second in the
		// background.
		const int = setInterval(() => {
			if (typeof document !== "undefined" && document.hidden) return;
			formatTime();
		}, 1000);
		const onVisible = () => {
			if (!document.hidden) formatTime();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			clearInterval(int);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [formatTime]);

	return timeAgo || formatTime();
}
