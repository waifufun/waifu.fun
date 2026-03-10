"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Coins, Shield, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAdminStats } from "@/lib/api";

export default function AdminPage() {
	const { data: stats, isLoading } = useQuery({
		queryKey: ["admin-stats"],
		queryFn: async () => {
			return await getAdminStats();
		},
		refetchInterval: 30000, // Refresh every 30 seconds
	});

	const adminSections = [
		{
			title: "Users",
			description: "Manage user accounts, view profiles, and handle user-related issues",
			icon: Users,
			href: "/admin/users",
			color: "text-blue-500",
			bgColor: "bg-blue-500/10",
			borderColor: "border-blue-500/20",
		},
		{
			title: "Tokens",
			description: "Monitor and manage tokens, handle verification, and token-related issues",
			icon: Coins,
			href: "/admin/tokens",
			color: "text-green-500",
			bgColor: "bg-green-500/10",
			borderColor: "border-green-500/20",
		},
		{
			title: "Moderators",
			description: "Manage moderator permissions, assign roles, and oversee moderation team",
			icon: Shield,
			href: "/admin/moderators",
			color: "text-purple-500",
			bgColor: "bg-purple-500/10",
			borderColor: "border-purple-500/20",
		},
	];

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
					<p className="text-gray-400 mt-2">Manage platform operations and user activities</p>
				</div>
				<Badge variant="outline" className="border-[#00FF87]/50 text-[#00FF87]">
					Admin Panel
				</Badge>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card className="bg-black/20 border-[#00FF87]/20">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-gray-400">Total Users</p>
								<p className="text-2xl font-bold text-white">
									{isLoading ? "..." : stats?.userCount?.toLocaleString() || "0"}
								</p>
							</div>
							<Users className="w-8 h-8 text-[#00FF87]" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-black/20 border-[#00FF87]/20">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-gray-400">Total Tokens</p>
								<p className="text-2xl font-bold text-white">
									{isLoading ? "..." : stats?.tokenCount?.toLocaleString() || "0"}
								</p>
							</div>
							<Coins className="w-8 h-8 text-[#00FF87]" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-black/20 border-[#00FF87]/20">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-gray-400">Active Moderators</p>
								<p className="text-2xl font-bold text-white">
									{isLoading ? "..." : stats?.activeModerators?.toLocaleString() || "0"}
								</p>
							</div>
							<Shield className="w-8 h-8 text-[#00FF87]" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-black/20 border-[#00FF87]/20">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-gray-400">24h Volume</p>
								<p className="text-2xl font-bold text-white">
									{isLoading ? "..." : `$${stats?.volume24h?.toLocaleString() || "0"}`}
								</p>
							</div>
							<BarChart3 className="w-8 h-8 text-[#00FF87]" />
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{adminSections.map((section) => {
					const IconComponent = section.icon;
					return (
						<Link key={section.title} href={section.href}>
							<Card
								className={`bg-black/20 border ${section.borderColor} hover:border-[#00FF87]/50 transition-all duration-200 cursor-pointer group`}
							>
								<CardHeader className="pb-3">
									<div className="flex items-center gap-3">
										<div className={`p-2 ${section.bgColor} group-hover:bg-[#00FF87]/10 transition-colors`}>
											<IconComponent
												className={`w-6 h-6 ${section.color} group-hover:text-[#00FF87] transition-colors`}
											/>
										</div>
										<div>
											<CardTitle className="text-white group-hover:text-[#00FF87] transition-colors">
												{section.title}
											</CardTitle>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<CardDescription className="text-gray-400 group-hover:text-gray-300 transition-colors">
										{section.description}
									</CardDescription>
								</CardContent>
							</Card>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
