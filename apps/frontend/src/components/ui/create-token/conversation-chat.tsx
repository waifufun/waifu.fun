"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowUp, Sparkles, User } from "lucide-react";
import type { BuilderMessage } from "./conversation-builder";
import { QUICK_PROMPTS } from "./conversation-builder";

// ---------------------------------------------------------------------------
// Markdown-lite renderer (no heavy deps — just bold, italic, newlines)
// ---------------------------------------------------------------------------
function renderMarkdownLite(text: string): React.ReactNode[] {
	const lines = text.split("\n");
	const nodes: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		// Process bold **text**
		const parts = line.split(/(\*\*[^*]+\*\*)/g);
		const processed = parts.map((part, j) => {
			if (part.startsWith("**") && part.endsWith("**")) {
				return (
					<span key={`${i}-${j}`} className="font-semibold text-[#e4e4e7]">
						{part.slice(2, -2)}
					</span>
				);
			}
			return part;
		});

		nodes.push(
			<span key={`line-${i}`}>
				{processed}
				{i < lines.length - 1 && <br />}
			</span>,
		);
	}

	return nodes;
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------
function TypingIndicator() {
	return (
		<div className="flex items-center gap-1 px-4 py-3">
			<div className="flex gap-1">
				{[0, 1, 2].map((i) => (
					<motion.span
						key={i}
						className="w-1.5 h-1.5 rounded-full bg-[#00ff87]/60"
						animate={{ opacity: [0.3, 1, 0.3] }}
						transition={{
							duration: 1.2,
							repeat: Number.POSITIVE_INFINITY,
							delay: i * 0.2,
						}}
					/>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------
function ChatBubble({
	message,
	isNew,
}: {
	message: BuilderMessage;
	isNew: boolean;
}) {
	const isAgent = message.role === "assistant";

	const animateVariants = {
		hidden: { opacity: 0, y: 12, scale: 0.97 },
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			transition: {
				type: "spring" as const,
				stiffness: 200,
				damping: 24,
			},
		},
	};

	const staticVariants = {
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
		},
	};

	return (
		<motion.div
			variants={isNew ? animateVariants : staticVariants}
			initial={isNew ? "hidden" : "visible"}
			animate="visible"
			className={cn("flex w-full", isAgent ? "justify-start" : "justify-end")}
		>
			{isAgent && (
				<div className="flex-shrink-0 mr-3 mt-1">
					<div className="w-7 h-7 rounded-sm bg-[#00ff87]/10 border border-[#00ff87]/20 flex items-center justify-center">
						<Sparkles className="w-3.5 h-3.5 text-[#00ff87]" />
					</div>
				</div>
			)}

			<div
				className={cn(
					"max-w-[80%] rounded-sm px-4 py-3 text-sm leading-relaxed",
					isAgent
						? "bg-[#111114] border border-[rgba(255,255,255,0.06)] text-[#a1a1aa]"
						: "bg-[#00ff87]/10 border border-[#00ff87]/15 text-[#e4e4e7] ml-auto",
				)}
			>
				{renderMarkdownLite(message.content)}
			</div>

			{!isAgent && (
				<div className="flex-shrink-0 ml-3 mt-1">
					<div className="w-7 h-7 rounded-sm bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center">
						<User className="w-3.5 h-3.5 text-[#71717a]" />
					</div>
				</div>
			)}
		</motion.div>
	);
}

// ---------------------------------------------------------------------------
// Quick prompt chips
// ---------------------------------------------------------------------------
function QuickPromptChips({
	onSelect,
}: {
	onSelect: (prompt: string) => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.4, type: "spring", stiffness: 120, damping: 20 }}
			className="flex flex-wrap gap-2 px-1 pb-2"
		>
			{QUICK_PROMPTS.slice(0, 4).map((prompt) => (
				<button
					key={prompt}
					type="button"
					onClick={() => onSelect(prompt)}
					className={cn(
						"text-xs text-[#71717a] px-3 py-1.5 rounded-sm",
						"border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]",
						"hover:border-[#00ff87]/30 hover:text-[#a1a1aa] hover:bg-[#00ff87]/5",
						"transition-all duration-200 text-left",
					)}
				>
					{prompt}
				</button>
			))}
		</motion.div>
	);
}

// ---------------------------------------------------------------------------
// Main chat component
// ---------------------------------------------------------------------------
interface ConversationChatProps {
	messages: BuilderMessage[];
	onSendMessage: (text: string) => void;
	isProcessing: boolean;
	showQuickPrompts: boolean;
	className?: string;
}

export function ConversationChat({
	messages,
	onSendMessage,
	isProcessing,
	showQuickPrompts,
	className,
}: ConversationChatProps) {
	const [inputText, setInputText] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [newMessageIds] = useState<Set<string>>(() => new Set());
	const prevCountRef = useRef(0);

	// Track which messages are "new" for animation
	useEffect(() => {
		if (messages.length > prevCountRef.current) {
			for (let i = prevCountRef.current; i < messages.length; i++) {
				newMessageIds.add(messages[i]!.id);
			}
		}
		prevCountRef.current = messages.length;
	}, [messages, newMessageIds]);

	// Auto-scroll
	useEffect(() => {
		if (scrollContainerRef.current) {
			requestAnimationFrame(() => {
				scrollContainerRef.current?.scrollTo({
					top: scrollContainerRef.current.scrollHeight,
					behavior: "smooth",
				});
			});
		}
	}, [messages, isProcessing]);

	// Auto-resize textarea
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
		}
	}, [inputText]);

	const handleSubmit = useCallback(() => {
		const trimmed = inputText.trim();
		if (!trimmed || isProcessing) return;
		onSendMessage(trimmed);
		setInputText("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [inputText, isProcessing, onSendMessage]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleQuickPrompt = (prompt: string) => {
		onSendMessage(prompt);
	};

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Messages area */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-4 scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.06)] scrollbar-track-transparent"
			>
				<AnimatePresence mode="popLayout">
					{messages.map((msg) => (
						<ChatBubble key={msg.id} message={msg} isNew={newMessageIds.has(msg.id)} />
					))}
				</AnimatePresence>

				{isProcessing && <TypingIndicator />}

				{/* Quick prompts after greeting */}
				{showQuickPrompts && messages.length <= 1 && !isProcessing && <QuickPromptChips onSelect={handleQuickPrompt} />}

				<div ref={messagesEndRef} />
			</div>

			{/* Input area */}
			<div className="flex-shrink-0 border-t border-[rgba(255,255,255,0.06)] bg-[#0a0a0c] px-4 py-3">
				<div className="flex items-end gap-2">
					<div className="flex-1 relative">
						<textarea
							ref={textareaRef}
							value={inputText}
							onChange={(e) => setInputText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="describe your agent..."
							rows={1}
							disabled={isProcessing}
							className={cn(
								"w-full resize-none bg-[#111114] border border-[rgba(255,255,255,0.08)] rounded-sm",
								"px-4 py-3 pr-12 text-sm text-[#e4e4e7] placeholder:text-[#3f3f46]",
								"focus:outline-none focus:border-[#00ff87]/40 focus:ring-1 focus:ring-[#00ff87]/20",
								"disabled:opacity-50 disabled:cursor-not-allowed",
								"transition-colors duration-200",
								"max-h-[120px]",
							)}
						/>
						<button
							type="button"
							onClick={handleSubmit}
							disabled={!inputText.trim() || isProcessing}
							className={cn(
								"absolute right-2 bottom-2 w-8 h-8 rounded-sm flex items-center justify-center",
								"transition-all duration-200",
								inputText.trim() && !isProcessing
									? "bg-[#00ff87] text-[#08080a] hover:bg-[#22c55e]"
									: "bg-[rgba(255,255,255,0.04)] text-[#3f3f46] cursor-not-allowed",
							)}
						>
							<ArrowUp className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
