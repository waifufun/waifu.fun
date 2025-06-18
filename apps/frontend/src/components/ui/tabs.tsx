"use client";

import type * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"border-2 border-[#03FF24]/50 rounded-none p-0 h-auto shadow-[3px_3px_0px_rgba(3,255,36,0.3)]",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"cursor-pointer bg-black items-center justify-center text-sm border-1 data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black] text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider border-r border-[#03FF24]/50 data-[state=active]:border-r-[#01a718]",
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
			className={cn("flex-1 outline-none bg-[#0c0c0c]", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
