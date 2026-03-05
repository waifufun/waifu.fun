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
				"border-2 border-[#FF2D78]/50 rounded-none p-0 h-auto",
				shadowed ? "shadow-[3px_3px_0px_rgba(255,45,120,0.3)]" : "",
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
				"cursor-pointer bg-black items-center justify-center text-sm border-1 data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black] text-gray-300 hover:text-[#FF2D78] hover:bg-[#FF2D78]/10 rounded-none py-3 font-bold uppercase tracking-wider",
				filled ? "data-[state=active]:bg-[#FF2D78]" : "data-[state=active]:bg-transparent",
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
