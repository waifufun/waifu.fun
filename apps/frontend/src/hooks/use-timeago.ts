"use client";
import { fromNow } from "@/lib/utils";
import moment from "moment";
import { useEffect, useState } from "react";

export default function useTimeAgo({ date }: { date: Date | string | number }) {
	const [timeAgo, setTimeAgo] = useState<string>();

	const formatTime = () => {
		const now = moment();
		const dateToCheck = moment(date);
		const diffSecs = now.diff(dateToCheck, "seconds");

		if (diffSecs > 59) {
			return setTimeAgo(fromNow(date, true));
		}

		return setTimeAgo(`${diffSecs}s`);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		const int = setInterval(() => {
			formatTime();
		}, 1000);

		return () => {
			clearInterval(int);
		};
	}, []);

	return timeAgo || formatTime();
}
