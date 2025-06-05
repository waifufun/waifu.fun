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
				"text-muted-foreground bg-red-500 bg-gradient-to-b from-[#0F0F0F] to-[#0D0D0D] rounded-tl-sm rounded-tr-sm inline-flex h-14 w-fit items-center justify-center",
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
				"data-[state=active]:bg-gradient-to-b from-[#171717] to-[#121212]  cursor-pointer dark:data-[state=active]:text-foreground dark:data-[state=active]:border-autofun-background-highlight dark:data-[state=active]:bg-autofun-background-card data-[state=active]:rounded-t-sm text-autofun-text-secondary inline-flex h-full flex-1 items-center justify-center gap-1.5 border-b-1 border-autofun-text-stroke-primary px-2 py-1 text-xl font-medium whitespace-nowrap transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
			className={cn("flex-1 outline-none rounded-b-sm bg-[#0c0c0c]", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
