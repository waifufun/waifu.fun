"use client";
import { useLocalStorage } from "usehooks-ts";

export default function useSlippage() {
	const [slippage, setSlippage] = useLocalStorage("slippage", 20);

	const handleSlippageChange = (value: number) => {
		if (Number.isNaN(value)) {
			return setSlippage(20);
		}
		if (value < 10) {
			return setSlippage(10);
		}

		if (value > 80) {
			return setSlippage(80);
		}

		return setSlippage(Number(value));
	};

	return {
		slippage,
		setSlippage: handleSlippageChange,
	};
}
