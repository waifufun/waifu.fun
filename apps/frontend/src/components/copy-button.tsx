"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	textToCopy: string;
	iconSize?: number;
	checkmarkDuration?: number;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
	textToCopy,
	iconSize = 16,
	checkmarkDuration = 500,
	className,
	children,
	...props
}) => {
	const [isCopied, setIsCopied] = useState(false);

	const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		try {
			await navigator.clipboard.writeText(textToCopy);
			setIsCopied(true);
		} catch (err) {
			console.error("Failed to copy text: ", err);
		}
	};

	useEffect(() => {
		let timerId: NodeJS.Timeout | undefined;
		if (isCopied) {
			timerId = setTimeout(() => {
				setIsCopied(false);
			}, checkmarkDuration);
		}
		return () => {
			if (timerId) {
				clearTimeout(timerId);
			}
		};
	}, [isCopied, checkmarkDuration]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={cn(
				"inline-flex items-center justify-center hover:text-white transition-colors duration-200 cursor-pointer",
				className,
			)}
			aria-label={isCopied ? "Copied" : "Copy to clipboard"}
			{...props}
		>
			{isCopied ? <Check size={iconSize} className="text-green-500" /> : <Copy size={iconSize} />}
			{children && <span className="ml-2">{children}</span>}
		</button>
	);
};
