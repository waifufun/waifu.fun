"use client";

import { ConnectModal } from "@/components/auth/connect-modal";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/locale-context";
import { useLinkedEoa } from "@/hooks/use-linked-eoa";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { useEffect, useState } from "react";

type LinkedEoaCTAProps = {
	className?: string;
	children?: React.ReactNode;
	onLinked?: () => void;
};

export function LinkedEoaCTA({ className, children, onLinked }: LinkedEoaCTAProps) {
	const { t } = useTranslation();
	const auth = useWaifuAuth();
	const linked = useLinkedEoa();
	const [authOpen, setAuthOpen] = useState(false);
	const [linking, setLinking] = useState(false);
	const [linkAfterConnect, setLinkAfterConnect] = useState(false);

	async function linkCurrentWallet() {
		if (!linked.isLinkedToPatron) {
			setLinking(true);
			try {
				await linked.link();
			} finally {
				setLinking(false);
			}
		}
		onLinked?.();
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once when RainbowKit supplies an address after the CTA opened it.
	useEffect(() => {
		if (!linkAfterConnect || !linked.address) return;
		setLinkAfterConnect(false);
		void linkCurrentWallet();
	}, [linkAfterConnect, linked.address]);

	async function handleClick() {
		if (!auth.isAuthenticated) {
			setAuthOpen(true);
			return;
		}
		if (!linked.address) {
			setLinkAfterConnect(true);
			linked.openConnectModal();
			return;
		}
		await linkCurrentWallet();
	}

	return (
		<>
			<Button type="button" onClick={handleClick} disabled={linking} className={className}>
				{linking
					? t("auth.linkedEoa.linking")
					: (children ?? (auth.isAuthenticated ? t("auth.linkedEoa.linkExternal") : t("auth.linkedEoa.signIn")))}
			</Button>
			<ConnectModal
				open={authOpen}
				onOpenChange={setAuthOpen}
				returnTo={typeof window !== "undefined" ? window.location.pathname : "/"}
			/>
		</>
	);
}
