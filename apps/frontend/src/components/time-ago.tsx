"use client";

import useTimeAgo from "@/hooks/use-timeago";

export default function TimeAgo({ date }: { date: number | Date | string }) {
	const time = useTimeAgo({ date });
	return time;
}
