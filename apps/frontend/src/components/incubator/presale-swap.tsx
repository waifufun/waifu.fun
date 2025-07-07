"use client";
import { useState, useMemo } from "react";
import type { IPresale } from "@autofun/types";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { fromNow } from "@/lib/utils";
import Progressbar from "../progressbar";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { participateInPresale, refundPresaleParticipation } from "@/lib/api";

export default function PresaleSwap({ presale }: { presale: IPresale }) {
	const [buyAmount, setBuyAmount] = useState<string>("");
	const [error, setError] = useState<string>("");
	const [isParticipating, setIsParticipating] = useState(false);
	const [isRefunding, setIsRefunding] = useState(false);

	const min = presale.settings.minimumInvestment;
	const max = presale.settings.maximumInvestment;
	const pricePerToken = presale.raise.pricePerToken;
	const pricePerTokenUsd = presale.raise.pricePerTokenUsd ?? 0;
	const canParticipate = presale.status === "active";
	const remainingSol = presale.raise.targetAmount - presale.raise.raisedAmount;
	const remainingTokens = remainingSol / pricePerToken;
	const progress = (presale.raise.raisedAmount / presale.raise.targetAmount) * 100;

	const calculatedTokens = useMemo(() => {
		const amt = Number.parseFloat(buyAmount);
		if (Number.isNaN(amt) || amt <= 0) return 0;
		return Math.min(amt / pricePerToken, remainingTokens);
	}, [buyAmount, pricePerToken, remainingTokens]);

	// Validation
	const validate = () => {
		const amt = Number.parseFloat(buyAmount);
		if (Number.isNaN(amt) || amt <= 0) return "Enter a valid amount";
		if (amt < min) return `Minimum buy is ${min} SOL`;
		if (amt > max) return `Maximum buy is ${max} SOL`;
		if (amt > remainingSol)
			return `Only ${remainingSol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL remaining`;
		return "";
	};

	// Update error on input change
	const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setBuyAmount(e.target.value);
		setError("");
	};

	// Re-validate on every render
	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useMemo(() => {
		setError(validate());
		// eslint-disable-next-line
	}, [buyAmount, min, max, remainingSol]);

	const participateMutation = useMutation({
		mutationFn: participateInPresale,
		onSuccess: () => {
			toast.success("Successfully participated in presale!");
			setBuyAmount("");
			setError("");
		},
		onError: (error: Error) => {
			toast.error(`Failed to participate: ${error.message}`);
		},
	});

	const refundMutation = useMutation({
		mutationFn: refundPresaleParticipation,
		onSuccess: (data) => {
			toast.success(`Successfully refunded ${data.refundAmount} ${presale.raise.currency}!`);
		},
		onError: (error: Error) => {
			toast.error(`Failed to refund: ${error.message}`);
		},
	});

	const handleParticipate = async () => {
		if (error || !buyAmount || Number.parseFloat(buyAmount) <= 0) {
			return;
		}

		setIsParticipating(true);
		try {
			const amount = Number.parseFloat(buyAmount);

			// TODO ** Malibu **: Implement blackchain  interaction when presale program is available

			await participateMutation.mutateAsync({
				id: String(presale._id || ""),
				amount,
			});
		} catch (error) {
			console.error("Error participating in presale:", error);
		} finally {
			setIsParticipating(false);
		}
	};

	const handleRefund = async () => {
		setIsRefunding(true);
		try {
			await refundMutation.mutateAsync({
				id: String(presale._id || ""),
			});
		} catch (error) {
			console.error("Error refunding presale participation:", error);
		} finally {
			setIsRefunding(false);
		}
	};

	if (!canParticipate) {
		// Show timer or status message
		return (
			<Card className="w-full bg-black border-[#03FF23]/20">
				<CardHeader>
					<CardTitle className="text-[#03FF23]">Presale is not active</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4 p-4">
					<div className="text-gray-400">
						Presale is currently <b>{presale.status}</b>.
					</div>
					{presale.schedule?.startDate && presale.status === "draft" && (
						<div className="text-sm text-gray-400">Starts in: {fromNow(presale.schedule.startDate, true)}</div>
					)}
					{presale.status === "failed" && (
						<div className="space-y-2">
							<div className="text-sm text-gray-400">
								This presale has failed. You can request a refund if you participated.
							</div>
							<Button
								onClick={handleRefund}
								disabled={isRefunding}
								className="w-full bg-red-600 hover:bg-red-700 text-white"
							>
								{isRefunding ? "Processing Refund..." : "Request Refund"}
							</Button>
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full bg-black border-[#03FF23]/20">
			<CardContent className="space-y-3 p-3 md:space-y-4 md:p-4">
				{/* Progress Section */}
				<div className="mb-2 md:mb-4">
					<div className="flex justify-between items-center mb-1 md:mb-2">
						<span className="text-xs md:text-sm text-gray-400">Funding Progress</span>
						<span className="text-[#03FF23] font-semibold text-xs md:text-base">{progress.toFixed(1)}%</span>
					</div>
					<Progressbar max={100} height="h-2 md:h-3" value={progress} />
					<div className="grid grid-cols-2 gap-2 md:gap-4 text-xs mt-1 md:mt-2">
						<div>
							<span className="text-gray-400">Softcap:</span>
							<p className="text-[#03FF23] font-semibold">
								{presale.raise.softCap} {presale.raise.currency}
							</p>
						</div>
						<div>
							<span className="text-gray-400">Hardcap:</span>
							<p className="text-[#03FF23] font-semibold">
								{presale.raise.targetAmount} {presale.raise.currency}
							</p>
						</div>
					</div>
				</div>
				{/* End Progress Section */}
				<div className="flex justify-between text-xs md:text-sm">
					<span>Price per token:</span>
					<span>
						{pricePerToken} SOL
						{pricePerTokenUsd ? <span className="text-gray-400"> (${pricePerTokenUsd.toFixed(2)})</span> : null}
					</span>
				</div>
				<div className="flex justify-between text-xs md:text-sm">
					<span>Remaining:</span>
					<span>
						{remainingSol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
						<span className="text-gray-400">
							{" "}
							({remainingTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens)
						</span>
					</span>
				</div>
				<div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
					<Input
						type="number"
						min={min}
						max={max}
						step={0.01}
						value={buyAmount}
						onChange={onInputChange}
						placeholder="Amount in SOL"
						className="w-full text-xs md:text-base"
					/>
					<span className="text-xs text-gray-400 whitespace-nowrap">
						Min: <span className="text-[#03FF23] font-bold">{min} SOL</span> / Max:{" "}
						<span className="text-[#03FF23] font-bold">{max} SOL</span>
					</span>
				</div>
				<div className="text-xs md:text-sm">
					You'll receive: <b>{calculatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> tokens
				</div>
				{error && <div className="text-red-500 text-xs font-semibold">{error}</div>}
				<Button
					className="w-full text-xs md:text-base py-2 md:py-3"
					disabled={!!error || !buyAmount || Number.parseFloat(buyAmount) <= 0 || isParticipating}
					onClick={handleParticipate}
				>
					{isParticipating ? "Participating..." : "Participate Now"}
				</Button>
			</CardContent>
		</Card>
	);
}
