export type WaifuLaunchTier = "80" | "90" | "95" | "98" | "test";

export interface WaifuLaunchMechanismSnapshot {
	tier: WaifuLaunchTier;
	presaleCapWei: string;
	curveFillWei: string;
	postGraduationLpWei: string;
	vestingEnabled: boolean;
	supplyBps: {
		presale: 4000;
		lp: 2000;
		treasuryReserve: 1000;
		burn: 3000;
	};
}

const FLAP_PROTOCOL_FEE_BPS = 100n;
const CALIBRATION_SAFETY_MARGIN_BPS = 100n;
const CURVE_FILL_REQUIRED_WEI = 16_000_000_000_000_000_000n;

function calibratedCurveFillWei(buyTaxBps: number): bigint {
	const tax = BigInt(buyTaxBps);
	if (tax > 1000n) throw new Error(`Invalid tax bps: ${buyTaxBps}`);
	const retainedBps = 10000n - FLAP_PROTOCOL_FEE_BPS - tax;
	const numerator = CURVE_FILL_REQUIRED_WEI * (10000n + CALIBRATION_SAFETY_MARGIN_BPS);
	return (numerator + retainedBps - 1n) / retainedBps;
}

export function getWaifuLaunchMechanismSnapshot(tier: WaifuLaunchTier, buyTaxBps = 300): WaifuLaunchMechanismSnapshot {
	const supplyBps = { presale: 4000, lp: 2000, treasuryReserve: 1000, burn: 3000 } as const;
	if (tier === "test") {
		return {
			tier,
			presaleCapWei: "2400000000000000000",
			curveFillWei: "2400000000000000000",
			postGraduationLpWei: "0",
			vestingEnabled: false,
			supplyBps,
		};
	}

	if (tier === "80") {
		return {
			tier,
			presaleCapWei: "16000000000000000000",
			curveFillWei: "16000000000000000000",
			postGraduationLpWei: "0",
			vestingEnabled: false,
			supplyBps,
		};
	}

	const presaleCapWei =
		tier === "90"
			? 32_000_000_000_000_000_000n
			: tier === "95"
				? 64_000_000_000_000_000_000n
				: tier === "98"
					? 160_000_000_000_000_000_000n
					: null;
	if (presaleCapWei === null) throw new Error(`Unknown tier: ${tier}`);

	const curveFillWei = calibratedCurveFillWei(buyTaxBps);
	if (curveFillWei >= presaleCapWei) throw new Error(`Tax ${buyTaxBps} makes curve fill exceed cap for tier ${tier}`);
	return {
		tier,
		presaleCapWei: presaleCapWei.toString(),
		curveFillWei: curveFillWei.toString(),
		postGraduationLpWei: (presaleCapWei - curveFillWei).toString(),
		vestingEnabled: true,
		supplyBps,
	};
}
