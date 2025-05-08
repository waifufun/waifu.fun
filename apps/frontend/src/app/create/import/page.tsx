"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Page() {
	return (
		<div className="flex flex-col gap-4 max-w-md mx-auto py-12">
			<Input placeholder="CA" />
			<Button>Import</Button>
		</div>
	);
}