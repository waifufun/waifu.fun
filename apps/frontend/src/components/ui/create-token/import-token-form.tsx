"use client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormSection } from "./form-section";
import { useAnimation } from "@/providers/animation-context";
import { cn } from "@/lib/utils";

export function ImportTokenForm() {
	const { animationLevel } = useAnimation();
	const formElementBaseClass =
		"bg-black border-2 border-[#03FF24]/60 placeholder-gray-500 text-sm focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)]";
	const formLabelBaseClass = "text-xs text-gray-400 uppercase tracking-wider font-semibold";

	return (
		<FormSection title="Import Token" className="max-w-md mx-auto" showUtilIcons>
			<div>
				<Label htmlFor="contractAddress" className={formLabelBaseClass}>
					Contract Address (CA)
				</Label>
				<Input
					type="text"
					id="contractAddress"
					placeholder="Enter token contract address"
					className={cn(formElementBaseClass, "mt-1 h-11")}
				/>
			</div>
			<Button className="w-full bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-sm h-10 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 uppercase tracking-wider">
				Import
			</Button>
		</FormSection>
	);
}
