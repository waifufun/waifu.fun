"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { AgentDetail } from "@/lib/api/patron";
import Image from "next/image";
import Link from "next/link";
import StatusBadge from "./status-badge";

type Props = {
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

export default function AgentHero({ agent, isLoading }: Props) {
	const { t } = useTranslation();
	if (isLoading || !agent) {
		return (
			<div className="flex items-center gap-4 animate-pulse">
				<div className="w-16 h-16 rounded-sm bg-[#141414]" />
				<div className="space-y-2">
					<div className="h-6 w-40 bg-[#141414] rounded" />
					<div className="h-4 w-24 bg-[#141414] rounded" />
				</div>
			</div>
		);
	}

	const xUrl = agent.xHandle ? `https://x.com/${agent.xHandle.replace(/^@/, "")}` : null;
	const publicUrl = agent.publicPageUrl ?? null;

	return (
		<div className="flex items-start gap-4 flex-wrap">
			<div className="w-16 h-16 rounded-sm overflow-hidden bg-[#141414] border border-stroke shrink-0">
				{agent.avatar ? (
					<Image
						src={agent.avatar}
						alt={t("patron.agentHero.avatarAlt", { name: agent.name })}
						width={64}
						height={64}
						className="object-cover w-full h-full"
						unoptimized
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-neutral-500 text-2xl">
						{agent.ticker?.[0] ?? "?"}
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-3 flex-wrap">
					<h1 className="text-2xl font-medium text-white">{agent.name}</h1>
					<StatusBadge status={agent.status} />
				</div>
				<p className="text-sm text-neutral-400 font-mono mt-1">${agent.ticker}</p>
				<div className="flex items-center gap-3 mt-2 text-sm">
					{publicUrl ? (
						<Link href={publicUrl} className="text-neutral-400 hover:text-white underline-offset-4 hover:underline">
							{t("patron.agentHero.publicPage")}
						</Link>
					) : null}
					{xUrl ? (
						<Link
							href={xUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-neutral-400 hover:text-white underline-offset-4 hover:underline"
						>
							@{agent.xHandle?.replace(/^@/, "")}
						</Link>
					) : null}
				</div>
			</div>
		</div>
	);
}
