"use client";
import { useAdmin } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import Link from "next/link";

export default function IncubatorAdminButton() {
	const { isAdmin } = useAdmin();

	if (!isAdmin) {
		return null;
	}

	return (
		<Link href="/incubator/admin">
			<Button
				variant="outline"
				className="border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10 hover:border-[#03FF24] transition-colors"
			>
				<Shield className="w-4 h-4 mr-2" />
				Admin
			</Button>
		</Link>
	);
} 