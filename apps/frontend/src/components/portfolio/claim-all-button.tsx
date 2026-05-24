"use client";

/**
 * Multi-tx claim sequencer for W51 patron dashboard.
 *
 * Iterates over every eligible vault and asks the wallet to sign a
 * `claim()` tx, one at a time. The button is intentionally NOT a single
 * batched call, claim() is a per-vault function on LaunchVault, and we
 * want each receipt to surface separately so a single failure doesn't
 * roll back the rest.
 *
 * UX:
 *   - disabled when no eligible positions
 *   - shows "claiming x of y" while in flight
 *   - after each tx submitted, calls onClaimed(vault) so the page can
 *     refresh the relevant row's claimable view
 *   - one final summary at the end (succeeded / failed counts)
 */
import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { type Address, isAddress } from "viem";
import { useWriteContract } from "wagmi";
import { bsc } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/locale-context";
import type { UserLaunchEntry } from "@/lib/api/portfolio";
import { launchVaultAbi } from "@/lib/launch-vault/abi";

type Props = {
	entries: UserLaunchEntry[];
	onClaimed?: (vault: Address) => void;
	onAllDone?: () => void;
};

type ClaimStatus =
	| { kind: "idle" }
	| { kind: "running"; index: number; total: number; vault: Address }
	| { kind: "done"; succeeded: number; failed: number }
	| { kind: "error"; message: string };

export default function ClaimAllButton({ entries, onClaimed, onAllDone }: Props) {
	const { t } = useTranslation();
	const { writeContractAsync } = useWriteContract();
	const [status, setStatus] = useState<ClaimStatus>({ kind: "idle" });

	// Eligible = launched + claimable > 0 + valid vault address.
	const eligible = entries.filter((e) => {
		if (e.launch.state !== "launched") return false;
		if (!isAddress(e.launch.vault)) return false;
		if (!e.position.claimable) return false;
		try {
			return BigInt(e.position.claimable) > 0n;
		} catch {
			return false;
		}
	});

	const run = useCallback(async () => {
		if (eligible.length === 0) return;

		let succeeded = 0;
		let failed = 0;
		for (let i = 0; i < eligible.length; i++) {
			const entry = eligible[i];
			if (!entry) continue;
			const vault = entry.launch.vault as Address;
			setStatus({ kind: "running", index: i + 1, total: eligible.length, vault });
			try {
				const hash = await writeContractAsync({
					address: vault,
					abi: launchVaultAbi,
					functionName: "claim",
					chainId: bsc.id,
				});
				if (hash) {
					succeeded += 1;
					onClaimed?.(vault);
				}
			} catch (err) {
				failed += 1;
				// User rejection or revert, keep going to the next one. We
				// surface the count in the summary; per-tx errors aren't
				// fatal to the sequence. If every single one is a rejection,
				// short-circuit so we don't keep nagging the user.
				const message = err instanceof Error ? err.message : "claim failed";
				if (/reject|denied|user/i.test(message) && failed === eligible.length) {
					setStatus({ kind: "error", message: t("portfolio.claimAll.userRejected") });
					return;
				}
			}
		}
		setStatus({ kind: "done", succeeded, failed });
		onAllDone?.();
	}, [writeContractAsync, eligible, onClaimed, onAllDone, t]);

	const isRunning = status.kind === "running";

	const summary = (() => {
		if (status.kind === "running") {
			return t("portfolio.claimAll.summaryRunning", { index: String(status.index), total: String(status.total) });
		}
		if (status.kind === "done") {
			if (status.failed === 0) {
				return status.succeeded === 1
					? t("portfolio.claimAll.summaryDoneSingular", { count: String(status.succeeded) })
					: t("portfolio.claimAll.summaryDonePlural", { count: String(status.succeeded) });
			}
			return t("portfolio.claimAll.summaryPartial", {
				succeeded: String(status.succeeded),
				failed: String(status.failed),
			});
		}
		if (status.kind === "error") return status.message;
		return null;
	})();

	const disabled = eligible.length === 0 || isRunning;

	return (
		<div className="flex flex-col items-end gap-1">
			<Button
				type="button"
				onClick={run}
				disabled={disabled}
				className="bg-[#00ff87] text-black hover:bg-[#00ff87]/90 disabled:bg-[#00ff87]/30 disabled:text-black/50"
			>
				{isRunning ? (
					<>
						<Loader2 className="size-4 animate-spin" /> {t("portfolio.claimAll.claiming")}
					</>
				) : (
					t("portfolio.claimAll.claimAllLabel", { count: String(eligible.length) })
				)}
			</Button>
			{summary ? (
				<span
					className={`text-[10px] font-mono uppercase tracking-[0.18em] ${
						status.kind === "error" ? "text-red-400" : "text-neutral-500"
					}`}
				>
					{summary}
				</span>
			) : null}
		</div>
	);
}
