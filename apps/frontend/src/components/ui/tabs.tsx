"use client";

import type * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({
	className,
	shadowed = true,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { shadowed?: boolean }) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"border border-[rgba(255,255,255,0.06)] rounded-xl p-0.5 h-auto bg-[rgba(17,17,20,0.7)] backdrop-blur-sm",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	filled = true,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { filled?: boolean }) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"cursor-pointer bg-transparent items-center justify-center text-sm text-[#71717a] hover:text-[#e4e4e7] hover:bg-[rgba(139,92,246,0.08)] rounded-lg py-2.5 font-semibold uppercase tracking-wider transition-all duration-200",
				filled
					? "data-[state=active]:bg-[#8b5cf6] data-[state=active]:text-white data-[state=active]:shadow-[0_0_12px_rgba(139,92,246,0.3)]"
					: "data-[state=active]:bg-transparent data-[state=active]:text-[#8b5cf6]",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none bg-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
