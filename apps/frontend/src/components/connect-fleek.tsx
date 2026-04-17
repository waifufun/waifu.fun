"use client";
import { useTranslation } from "@/contexts/locale-context";
import { connectAgent } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { IToken, TChainId } from "@waifufun/types";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export default function ConnectToFleek({ token }: { token: IToken }) {
	const { t } = useTranslation();
	const [showInput, setShowInput] = useState<boolean>(false);
	const [agentId, setAgentId] = useState<string>("");
	const queryClient = useQueryClient();
	const chain = token.chain;
	const chainId = token.chainId as TChainId;
	const contractAddress = token.contractAddress;

	const connectAgentMutation = useMutation({
		mutationFn: connectAgent,
		mutationKey: ["connect-agent"],
		onSuccess: (agent) => {
			console.log("connected agent succesful:", agent);
			toast.success(t("connectFleek.successToast"));
			queryClient.invalidateQueries({ queryKey: ["get-agent"] });
		},
		onError: (error) => {
			console.error("Error connecting agent:", error);
			toast.error(`${t("connectFleek.errorToast")}: ${error.message}`);
		},
	});

	return (
		<div className="bg-black ƒlex place-self-center w-[408px]">
			<div className="p-4 flex flex-col text-center transition-all duration-300 ease-in-out">
				<h1 className="font-semibold text-white text-2xl">
					{t("connectFleek.title")}{" "}
					<span className="text-waifufun-background-action-highlight">{t("connectFleek.titleAgent")}</span>
				</h1>
				<p className="text-white text-lg mt-4">{t("connectFleek.launchWithEliza")}</p>
				<Image alt="fleek-logo" src="/fleek/fleek-logo.svg" height={50} width={70} className="mt-1 self-center" />

				{!showInput && (
					<Button
						onClick={() => setShowInput((prev) => !prev)}
						className="mt-5 h-fit bg-transparent hover:bg-white/5 border border-waifufun-background-action-highlight text-white transition-all"
					>
						{t("connectFleek.importFleekAgent")}
					</Button>
				)}

				<div
					className={`overflow-hidden transition-all duration-300 ease-in-out ${
						showInput ? "max-h-40 mt-4" : "max-h-0"
					}`}
				>
					{showInput && (
						<div className="flex flex-col items-center gap-2">
							<p className="text-white text-sm">{t("connectFleek.fillAgentId")}</p>
							<Input
								value={agentId}
								onChange={(e) => setAgentId(e.target.value)}
								placeholder={t("connectFleek.placeholderAgentId")}
								className="text-white bg-transparent border-white/20"
							/>
							{connectAgentMutation.isError && (
								<p className="text-red-500 text-sm">{t("connectFleek.somethingWrong")}</p>
							)}
							<Button
								onClick={() => connectAgentMutation.mutate({ agentId, contractAddress, chain, chainId })}
								className="mt-2 bg-waifufun-background-action-highlight text-black hover:bg-opacity-90"
								disabled={connectAgentMutation.isPending}
							>
								{connectAgentMutation.isPending ? t("connectFleek.submitting") : t("connectFleek.submit")}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
