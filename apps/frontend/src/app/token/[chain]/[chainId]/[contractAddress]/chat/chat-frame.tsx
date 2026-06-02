"use client";

import { getTokenChatSession } from "@/lib/api";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { useQuery } from "@tanstack/react-query";
import type { ITokenLookUp } from "@waifufun/types";
import { LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	canRequestHostedChatSession,
	HOSTED_CHAT_IFRAME_ALLOW,
	HOSTED_CHAT_IFRAME_REFERRER_POLICY,
	HOSTED_CHAT_IFRAME_SANDBOX,
} from "./chat-frame-policy";

type ChatFrameProps = {
	params: ITokenLookUp;
	tokenName: string;
	status: string;
	cloudAgentId?: string | null | undefined;
};

export default function ChatFrame({ params, tokenName, status, cloudAgentId }: ChatFrameProps) {
	const auth = useWaifuAuth();
	const pathname = usePathname();
	const canRequestChat = canRequestHostedChatSession(auth);
	const chat = useQuery({
		queryKey: ["token-chat-session", params.chain, params.chainId, params.contractAddress, auth.primaryAddress],
		queryFn: () =>
			getTokenChatSession({
				chain: params.chain,
				chainId: params.chainId,
				contractAddress: params.contractAddress,
			}),
		enabled: canRequestChat,
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: 10 * 60 * 1000,
	});

	if (auth.isLoading || (canRequestChat && chat.isLoading)) {
		return (
			<section className="flex min-h-[520px] flex-1 items-center justify-center rounded-sm border border-white/10 bg-[#0c0c0e]">
				<div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-neutral-500">
					<LoaderCircle className="size-4 animate-spin" />
					checking wallet access
				</div>
			</section>
		);
	}

	if (chat.data?.chatUrl) {
		return (
			<div className="flex min-h-[720px] flex-1 flex-col overflow-hidden rounded-sm border border-white/10 bg-black">
				<div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
					<span>role: {chat.data.role ?? "guest"}</span>
					<span>{status}</span>
				</div>
				<iframe
					title={`${tokenName} Eliza Cloud chat`}
					src={chat.data.chatUrl}
					className="min-h-[680px] flex-1 bg-black"
					allow={HOSTED_CHAT_IFRAME_ALLOW}
					referrerPolicy={HOSTED_CHAT_IFRAME_REFERRER_POLICY}
					sandbox={HOSTED_CHAT_IFRAME_SANDBOX}
				/>
			</div>
		);
	}

	const message = !auth.isAuthenticated
		? "connect an evm wallet with enough tokens to chat with this agent."
		: auth.primaryChain !== "evm"
			? "connect an evm wallet to verify token-holder chat access."
			: chat.error instanceof Error
				? chat.error.message
				: (chat.data?.message ?? "connect a wallet with enough tokens to chat with this agent.");
	const connectHref = `/auth/connect?return_to=${encodeURIComponent(pathname ?? `/token/${params.chain}/${params.chainId}/${params.contractAddress}/chat`)}`;

	return (
		<section className="rounded-sm border border-white/10 bg-[#0c0c0e] p-6">
			<div className="flex items-center gap-2 text-sm font-mono text-white">
				<LockKeyhole className="size-4 text-amber-300" />
				runtime chat locked
			</div>
			<p className="mt-2 max-w-2xl text-sm text-neutral-400">{message}</p>
			<p className="mt-3 text-xs font-mono text-neutral-500">
				guest: &gt;1,000 tokens · user: &gt;100,000 tokens · creator: admin
			</p>
			{cloudAgentId ? (
				<p className="mt-4 break-all text-xs font-mono text-neutral-500">cloud agent: {cloudAgentId}</p>
			) : null}
			<button
				type="button"
				onClick={() => {
					if (canRequestChat) {
						void chat.refetch();
					} else {
						void auth.refetch();
					}
				}}
				className="mt-5 inline-flex items-center gap-2 rounded-sm border border-white/10 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-neutral-200 hover:border-white/20"
			>
				<RefreshCw className="size-3" />
				retry
			</button>
			{!auth.isAuthenticated || auth.primaryChain !== "evm" ? (
				<Link
					href={connectHref}
					className="ml-2 inline-flex items-center rounded-sm border border-[#00ff87]/20 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-[#00ff87] hover:border-[#00ff87]/40"
				>
					connect wallet
				</Link>
			) : null}
		</section>
	);
}
