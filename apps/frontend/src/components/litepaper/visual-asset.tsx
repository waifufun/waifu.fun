"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type VisualAssetProps = {
	src: string;
	alt: string;
	className?: string;
	imageClassName?: string;
	fallbackClassName?: string;
	overlayClassName?: string;
	sizes?: string;
	priority?: boolean;
	children?: React.ReactNode;
};

export default function VisualAsset({
	src,
	alt,
	className,
	imageClassName,
	fallbackClassName,
	overlayClassName,
	sizes,
	priority,
	children,
}: VisualAssetProps) {
	const [hasError, setHasError] = useState(false);

	return (
		<div className={cn("relative overflow-hidden", className)}>
			<div
				className={cn(
					"absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,135,0.2),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(255,50,180,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(0,200,255,0.12),transparent_32%),linear-gradient(180deg,#111114_0%,#08080A_100%)]",
					fallbackClassName,
				)}
			/>
			{!hasError ? (
				<Image
					src={src}
					alt={alt}
					fill
					sizes={sizes ?? "100vw"}
					priority={priority ?? false}
					onError={() => setHasError(true)}
					className={cn("object-cover object-center", imageClassName)}
				/>
			) : null}
			<div
				className={cn(
					"pointer-events-none absolute inset-0 bg-[url('/textures/noise.png')] bg-[length:280px_280px] opacity-[0.08] mix-blend-screen",
					overlayClassName,
				)}
			/>
			{children}
		</div>
	);
}
