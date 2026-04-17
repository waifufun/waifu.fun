"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MessageSquare, SlidersHorizontal, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ConversationBuilder, type BuilderMessage, type AgentCharacter } from "./conversation-builder";
import { ConversationChat } from "./conversation-chat";
import { CharacterPreviewPanel } from "./character-preview-panel";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";

// ---------------------------------------------------------------------------
// Phase 1: Connect prompt
// ---------------------------------------------------------------------------
function ConnectPhase() {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className="flex items-center justify-center min-h-[60vh]"
		>
			<div className="w-full max-w-sm space-y-6 text-center">
				<div className="space-y-2">
					<div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-[rgba(0,255,135,0.06)] border border-[#00ff87]/15">
						<Wallet className="w-5 h-5 text-[#00ff87]" />
					</div>
					<h2 className="text-xl font-bold text-[#e4e4e7] tracking-tight">connect wallet</h2>
					<p className="text-sm text-[#52525b]">required to deploy your agent on-chain</p>
				</div>

				<ConnectButton.Custom>
					{({ openConnectModal }) => (
						<button
							type="button"
							onClick={openConnectModal}
							className={cn(
								"w-full h-12 rounded-sm font-mono text-sm font-bold uppercase tracking-wider",
								"bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e]",
								"transition-all duration-200",
								"focus:outline-none focus:ring-2 focus:ring-[#00ff87] focus:ring-offset-2 focus:ring-offset-[#08080a]",
							)}
						>
							connect wallet
						</button>
					)}
				</ConnectButton.Custom>
			</div>
		</motion.div>
	);
}

// ---------------------------------------------------------------------------
// Mobile view toggle
// ---------------------------------------------------------------------------
function MobileViewToggle({
	view,
	onViewChange,
	hasCharacter,
}: {
	view: "chat" | "preview";
	onViewChange: (v: "chat" | "preview") => void;
	hasCharacter: boolean;
}) {
	return (
		<div className="flex lg:hidden border-b border-[rgba(255,255,255,0.06)] bg-[#08080a]">
			<button
				type="button"
				onClick={() => onViewChange("chat")}
				className={cn(
					"flex-1 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
					view === "chat" ? "text-[#00ff87] border-b-2 border-[#00ff87]" : "text-[#52525b] hover:text-[#71717a]",
				)}
			>
				<MessageSquare className="w-3.5 h-3.5" />
				chat
			</button>
			<button
				type="button"
				onClick={() => onViewChange("preview")}
				className={cn(
					"flex-1 py-2.5 text-xs font-mono uppercase tracking-wider transition-colors flex items-center justify-center gap-2",
					view === "preview" ? "text-[#00ff87] border-b-2 border-[#00ff87]" : "text-[#52525b] hover:text-[#71717a]",
					!hasCharacter && "opacity-40 cursor-not-allowed",
				)}
				disabled={!hasCharacter}
			>
				<SlidersHorizontal className="w-3.5 h-3.5" />
				preview
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main conversational create component
// ---------------------------------------------------------------------------
export function ConversationalCreate() {
	const { isConnected } = useAccount();
	const {
		generateToken,
		isGeneratingMedia,
		previousImages,
		uploadedImage,
		setValue: setFormValue,
		watchValue,
	} = usePrompt();

	// Builder state
	const builderRef = useRef<ConversationBuilder>(new ConversationBuilder());
	const [messages, setMessages] = useState<BuilderMessage[]>([]);
	const [character, setCharacter] = useState<AgentCharacter>(builderRef.current.getCharacter());
	const [isProcessing, setIsProcessing] = useState(false);
	const [showLaunchButton, setShowLaunchButton] = useState(false);
	const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
	const [welcomeSent, setWelcomeSent] = useState(false);

	// Get display image
	const displayImage =
		uploadedImage === null ? undefined : uploadedImage || (previousImages.length > 0 ? previousImages[0] : undefined);

	// Send welcome message on mount (only when connected)
	useEffect(() => {
		if (isConnected && !welcomeSent) {
			const welcome = builderRef.current.getWelcomeMessage();
			setMessages([welcome]);
			setWelcomeSent(true);
		}
	}, [isConnected, welcomeSent]);

	// Sync character fields to the form context whenever character changes
	useEffect(() => {
		if (character.name) {
			setFormValue("name", character.name, { shouldValidate: true });
		}
		if (character.ticker) {
			setFormValue("symbol", character.ticker, { shouldValidate: true });
		}
		if (character.description) {
			setFormValue("description", character.description, { shouldValidate: true });
		}
		if (character.personality) {
			setFormValue("prompt", character.personality);
		}
	}, [character, setFormValue]);

	// Handle sending a message
	const handleSendMessage = useCallback(
		(text: string) => {
			// Add user message
			const userMsg: BuilderMessage = {
				id: `user-${Date.now()}`,
				role: "user",
				content: text,
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, userMsg]);
			setIsProcessing(true);

			// Simulate slight delay for natural feel
			setTimeout(
				() => {
					const response = builderRef.current.processMessage(text);

					// Update character state
					if (response.characterDelta) {
						setCharacter((prev) => ({ ...prev, ...response.characterDelta }));
						builderRef.current.updateCharacter(response.characterDelta);
					}

					// Trigger image generation if requested
					if (response.generateImage) {
						const prompt =
							builderRef.current.getCharacter().avatarPrompt ||
							builderRef.current.getCharacter().personality ||
							builderRef.current.getCharacter().description ||
							"";
						generateToken({ mediaType: "image", prompt });
						builderRef.current.markImageGenerated();
					}

					// Show launch button
					if (response.readyToLaunch) {
						setShowLaunchButton(true);
					}

					setMessages((prev) => [...prev, response]);
					setIsProcessing(false);
				},
				400 + Math.random() * 300,
			);
		},
		[generateToken],
	);

	// Handle character updates from preview panel
	const handleCharacterUpdate = useCallback((delta: Partial<AgentCharacter>) => {
		setCharacter((prev) => ({ ...prev, ...delta }));
		builderRef.current.updateCharacter(delta);
	}, []);

	// Handle image regeneration
	const handleRegenerateImage = useCallback(() => {
		const prompt = character.avatarPrompt || character.personality || character.description || "";
		generateToken({ mediaType: "image", prompt });
	}, [character, generateToken]);

	const hasCharacter = !!(character.name || character.description);

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	// Phase 1: Connect
	if (!isConnected) {
		return <ConnectPhase />;
	}

	// Phase 2+: Chat + Preview
	return (
		<div className="w-full min-h-[calc(100dvh-80px)] bg-[#08080a]">
			{/* Mobile toggle */}
			<MobileViewToggle view={mobileView} onViewChange={setMobileView} hasCharacter={hasCharacter} />

			{/* Split layout */}
			<div className="w-full max-w-7xl mx-auto">
				<div className="grid lg:grid-cols-[1fr_340px] min-h-[calc(100dvh-120px)]">
					{/* Left: Chat */}
					<div className={cn("border-r border-[rgba(255,255,255,0.04)]", mobileView !== "chat" && "hidden lg:block")}>
						<ConversationChat
							messages={messages}
							onSendMessage={handleSendMessage}
							isProcessing={isProcessing}
							showQuickPrompts={true}
							className="h-full"
						/>
					</div>

					{/* Right: Preview panel */}
					<div className={cn("bg-[#0a0a0c] p-4", mobileView !== "preview" && "hidden lg:block")}>
						<div className="sticky top-4">
							<CharacterPreviewPanel
								character={character}
								imageUrl={displayImage}
								isGeneratingImage={isGeneratingMedia}
								onCharacterUpdate={handleCharacterUpdate}
								onRegenerateImage={handleRegenerateImage}
								showLaunchButton={showLaunchButton || builderRef.current.isReadyToLaunch()}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
