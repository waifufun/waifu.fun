"use client";
import { useState } from "react";
import { Switch } from "../switch-button";
import type { IToken, ITokenSocials } from "@waifufun/types";
import { ChevronUp } from "lucide-react";
import { Input } from "../ui/input";
import Image from "next/image";
import { Button } from "../ui/button";

const socials: (keyof ITokenSocials)[] = ["website", "telegram", "twitter", "discord"];

export default function TokenAdminCard({ token }: { token: IToken }) {
	const [open, setOpen] = useState(false);

	const isVerified = token.verified;
	const isFeatured = token.featured;

	return (
		<div className="w-[460px] p-4 rounded-md overflow-hidden bg-[#0C0C0C]">
			<div className="flex justify-between items-center h-[44px] w-[428px]">
				<h2 className="text-white text-lg font-medium border-b border-waifufun-background-action-highlight uppercase">
					owner settings
				</h2>
				<div
					className="w-[44px] h-[44px] flex items-center justify-center cursor-pointer"
					onClick={() => setOpen(!open)}
					// for lint
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							setOpen(!open);
						}
					}}
				>
					<div className="flex place-content-center border borer-[#262626] items-center rounded-md bg-gradient-to-t to-[#171717] from-[#121212] h-[44px] w-[44px]">
						<ChevronUp
							className={`text-white transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
							size={24}
						/>
					</div>
				</div>
			</div>

			{open && (
				<div className="transition-all duration-300 mt-4 space-y-3">
					<div className="w-full h-px bg-[#262626]" />
					<h1 className="text-lg font-medium text-white">Update Social Links</h1>
					{socials.map((social) => (
						<div key={social} className="flex items-center h-[50px] w-full space-x-4">
							<div className="flex place-content-center items-center rounded-md bg-gradient-to-t to-[#171717] from-[#121212] h-[44px] w-[44px]">
								<Image src={`/socials/${social}.svg`} height={24} width={24} alt={`${social} icon`} />
							</div>
							<Input
								value={token.socials[social] ?? ""}
								placeholder={`Enter ${social} link`}
								className="border border-[#1A1A1A] p-4 w-[372px] h-[50px] px-2 text-white"
							/>
						</div>
					))}
					<Button className="w-full h-[40] font-medium mt-1 rounded-md text-white bg-gradient-to-b from-[#141414] via-[#131313] to-[#121212] border border-waifufun-background-action-highlight">
						Save
					</Button>
					<div className="w-full mt-1 h-px bg-[#262626]" />
					<div>
						<h3 className="text-white font-medium text-lg mb-2">Remove Tags</h3>
						<div className="flex justify-between">
							{isFeatured ? (
								<Button className="w-[208px] h-[44px] text-base font-bold rounded-md text-white border border-[#262626] bg-gradient-to-t to-[#171717] from-[#121212]">
									Remove Featured
								</Button>
							) : (
								<Button className="w-[208px] h-[44px] text-base font-bold rounded-md text-white border border-[#262626] bg-gradient-to-t to-[#171717] from-[#121212]">
									Mark as Featured
								</Button>
							)}

							{isVerified ? (
								<Button className="w-[208px] h-[44px] text-base font-bold rounded-md text-white border border-[#262626] bg-gradient-to-t to-[#171717] from-[#121212]">
									Remove Verified
								</Button>
							) : (
								<Button className="w-[208px] h-[44px] text-base font-bold rounded-md text-white border border-[#262626] bg-gradient-to-t to-[#171717] from-[#121212]">
									Mark as Verified
								</Button>
							)}
						</div>
					</div>
					<div className="w-full h-px mt-4 bg-[#262626]" />
					<div className="flex justify-between items-center mt-2">
						<span className="text-white font-medium text-lg">Hide Token</span>
						<Switch />
					</div>
				</div>
			)}
		</div>
	);
}
