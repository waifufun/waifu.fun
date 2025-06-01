"use client";

import useTimeAgo from "@/hooks/use-timeago";
import Skeleton from "./skeleton-loading";

export default function TimeAgo({ date }: { date: number | Date | string }) {
	const time = useTimeAgo({ date });

	if (typeof window === "undefined") {
		return <Skeleton className="w-16" />;
	}
	return time;
}
