"use client";

import useTimeAgo from "@/hooks/use-timeago";
import Skeleton from "./skeleton-loading";
import { useIsClient } from "usehooks-ts";

export default function TimeAgo({ date }: { date: number | Date | string }) {
	const time = useTimeAgo({ date });
	const client = useIsClient();

	if (!client) {
		return <Skeleton className="w-16" />;
	}

	return <>{time}</>;
}
