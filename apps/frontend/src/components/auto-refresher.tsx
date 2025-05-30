"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface AutoRefresherProps {
	interval?: number;
}

const AutoRefresher: React.FC<AutoRefresherProps> = ({ interval = 5000 }) => {
	const router = useRouter();
	useEffect(() => {
		const intervalId = setInterval(() => {
			router.refresh();
		}, interval);

		return () => clearInterval(intervalId);
	}, [interval, router.refresh]);

	return null;
};

export default AutoRefresher;
