"use client";
import TokenTypeSelector from "@/components/create-token-page/token-type-selector";
import { PromptProvider } from "@/components/hooks/providers/usePromptContext";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { useEffect, useState } from "react";
import Image from "next/image";
import TokenInfo from "@/components/create-token-page/token-info";

const PromptComponent = () => {
	const { registerForm, generateToken, watchValue } = usePrompt();
	const [rows, setRows] = useState(3);
	const MAX_ROWS = 5;

	const prompt = watchValue("prompt");

	return (
		<div
			className="flex gap-4 bg-[#3333331A] px-4 items-center rounded-sm"
			style={{
				background: "linear-gradient(180deg, #171717 0%, #141414 100%)",
			}}
		>
			<textarea
				className="w-full rounded-sm py-3 resize-none overflow-aut focus:outline-none"
				placeholder="A grumpy, older man in a Hawaiian shirt, wildly ripping open a vintage tech package with an ecstatic yet furious expression.  Surrounded by styrofoam peanuts and packing tape.  Highly detailed, 8k resolution, trending art style, vibrant colors, dramatic lighting."
				{...registerForm("prompt")}
				rows={rows}
				style={{
					minHeight: "4.5rem",
				}}
			/>
			<button
				type="button"
				style={{
					background: "linear-gradient(106.96deg, #141414 -24.65%, #131313 48.9%, #121212 109.26%)",
				}}
				className="border border-[#03FF24] rounded-sm hover:cursor-pointer px-4 py-2 text-base uppercase font-[500]"
				onClick={() => {
					if (!prompt) {
						generateToken();
					} else {
						generateToken(prompt.toString().length > 0 ? prompt.toString() : "");
					}
				}}
			>
				<p>Create</p>
			</button>
		</div>
	);
};

const AIImageWithPlaceHolder = ({ href }: { href: string | undefined }) => {
	if (!href) {
		return (
			<div className="w-full h-full bg-[#3333331A] rounded-sm flex items-center justify-center">
				<p>No Image</p>
			</div>
		);
	}
	return (
		<div className="w-full h-full relative rounded-sm overflow-hidden">
			<Image alt="Generated Image" src={href} layout="fill" objectFit="cover" className="rounded-sm" />
		</div>
	);
};

const AiImageLoading = () => {
	return (
		<div className="w-full h-full bg-[#3333331A] rounded-sm flex items-center justify-center">
			<p>Loading...</p>
		</div>
	);
};

const GeneratedImages = () => {
	const { previousImages, generateToken } = usePrompt();
	const { isGeneratingImage, changeMainImage } = usePrompt();

	// biome-ignore lint/correctness/useExhaustiveDependencies: Exhaustive deps
	useEffect(() => {
		generateToken();
	}, []);

	const startingIndex = isGeneratingImage ? 0 : 1;

	const nextImages: (string | undefined)[] = previousImages.slice(startingIndex, startingIndex + 3);

	if (nextImages.length < 3) {
		const diff = 3 - nextImages.length;
		for (let i = 0; i < diff; i++) {
			nextImages.push(undefined);
		}
	}
	return (
		<div className="w-full flex justify-center">
			<div className="w-[300px] sm:w-[500px]">
				<div className="w-full h-[300px] sm:h-[500px] rounded-sm overflow-hidden relative">
					{isGeneratingImage && <AiImageLoading />}
					{!isGeneratingImage && <AIImageWithPlaceHolder href={previousImages[0]} />}
				</div>
				<div>
					<div>
						<div className="grid grid-cols-3 gap-4 mt-4">
							{nextImages.map((image, index) => (
								<button
									type="button"
									onClick={() => {
										changeMainImage(index + 1);
									}}
									// biome-ignore lint/suspicious/noArrayIndexKey: Exhaustive deps
									key={index}
									className="w-full aspect-square hover:cursor-pointer rounded-sm overflow-hidden relative"
								>
									<AIImageWithPlaceHolder href={image} />
								</button>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default function CreateTokenPage() {
	return (
		<PromptProvider>
			<div className="flex justify-center">
				<div className="flex flex-col items-center mt-5 w-full max-w-[1100px]">
					<div>
						<img src="/create/coin-machine.png" alt="coin" />
					</div>
					<div className="rounded-sm bg-[#3333331A] w-full overflow-hidden">
						<TokenTypeSelector selected="auto" />
						<div className="p-4">
							<PromptComponent />
							<div className="flex flex-col lg:flex-row w-full gap-10 py-8">
								<GeneratedImages />
								<TokenInfo type="auto" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</PromptProvider>
	);
}
