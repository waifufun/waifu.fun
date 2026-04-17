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
	sizes,
	priority,
	children,
}: VisualAssetProps) {
	const [hasError, setHasError] = useState(false);

	return (
		<div className={cn("relative overflow-hidden", className)}>
			<div
				className={cn(
					"absolute inset-0 bg-gradient-to-b from-[#111114] to-[#08080a]",
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
			{children}
		</div>
	);
}
