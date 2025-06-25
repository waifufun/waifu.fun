"use client";

import { getAddressPoints } from "@/lib/api";
import type { AddressLike } from "@autofun/types";
import { useQuery } from "@tanstack/react-query";
import { formatNumber } from "@/lib/utils";

export default function PointsCounter({ address }: { address: AddressLike }) {
	const query = useQuery({
		queryKey: ["address-points", address],
		queryFn: async () => {
			if (!address) return null;
			const points = await getAddressPoints({ address });
			return points;
		},
		enabled: !!address,
	});

	const weeklyPoints = query?.data?.weeklyPoints || 0;
	const points = query?.data?.totalPoints || 0;

	return (
		<div className="flex flex-col space-y-1 px-3 text-xs w-full">
			<div className="flex justify-between w-full text-white">
				<span className="font-semibold">{formatNumber(weeklyPoints, false, true)}</span>
				<span>WP</span>
			</div>
			<div className="flex justify-between w-full text-white">
				<span className="text-yellow-400 font-semibold">{formatNumber(points, false, true)}</span>
				<span>PP</span>
			</div>
		</div>
	);
}
