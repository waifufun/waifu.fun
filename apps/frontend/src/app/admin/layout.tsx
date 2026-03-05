"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminStatus, getAuthStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Users, Coins, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminLayoutProps {
	children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
	const router = useRouter();
	const pathname = usePathname();
	const [isLoading, setIsLoading] = useState(true);
	const [isAdmin, setIsAdmin] = useState(false);
	const [userRole, setUserRole] = useState<string | null>(null);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	useEffect(() => {
		const checkAdminStatus = async () => {
			try {
				console.log("Checking admin status...");

				// First check if user is authenticated
				const authStatus = await getAuthStatus();
				console.log("Auth status:", authStatus);

				if (!authStatus.authenticated) {
					console.log("User not authenticated");
					setIsLoading(false);
					return;
				}

				// Then check admin status
				const adminStatus = await getAdminStatus();
				console.log("Admin status response:", adminStatus);

				if (!adminStatus.success) {
					console.error("Admin status check failed:", adminStatus.error);
					router.push("/");
					return;
				}

				if (!adminStatus.isAdmin) {
					console.log("User is not an admin, redirecting...");
					router.push("/");
					return;
				}

				setIsAdmin(true);
				setUserRole(adminStatus.adminInfo?.role || "admin");
			} catch (error) {
				console.error("Failed to check admin status:", error);
				router.push("/");
			} finally {
				setIsLoading(false);
			}
		};

		checkAdminStatus();
	}, [router]);

	const adminNavItems = [
		{
			title: "Overview",
			href: "/admin",
			icon: Shield,
			description: "Admin dashboard and statistics",
		},
		{
			title: "Users",
			href: "/admin/users",
			icon: Users,
			description: "Manage user accounts",
		},
		{
			title: "Tokens",
			href: "/admin/tokens",
			icon: Coins,
			description: "Manage tokens and verification",
		},
		{
			title: "Moderators",
			href: "/admin/moderators",
			icon: Shield,
			description: "Manage moderator team",
		},
	];

	if (isLoading) {
		return (
			<div className="min-h-screen bg-black flex items-center justify-center">
				<Card className="bg-black/20 border-[#E8762D]/20 w-96">
					<CardContent className="p-6">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8762D]" />{" "}
							<span className="ml-3 text-white">Checking admin access...</span>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className="min-h-screen bg-black flex items-center justify-center">
				<Card className="bg-black/20 border-[#E8762D]/20 w-96">
					<CardContent className="p-6 text-center">
						<Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
						<h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
						<p className="text-gray-400 mb-4">You don't have permission to access the admin panel.</p>
						<Button onClick={() => router.push("/")} className="w-full">
							<ArrowLeft className="w-4 h-4 mr-2" />
							Back to Home
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-black">
			{/* Header */}
			<div className="bg-black/50 border-b border-[#E8762D]/20 p-4">
				<div className="container mx-auto flex items-center justify-between">
					<div className="flex items-center gap-2 md:gap-4">
						<Button
							variant="ghost"
							onClick={() => router.push("/")}
							className="text-[#E8762D] hover:bg-[#E8762D]/10 p-2 md:p-2"
						>
							<ArrowLeft className="w-4 h-4 md:mr-2" />
							<span className="hidden md:inline">Back to Site</span>
						</Button>
						<div className="hidden md:block h-6 w-px bg-[#E8762D]/30" />
						<h1 className="text-lg md:text-xl font-bold text-white">Admin Panel</h1>
						{userRole && (
							<span className="px-2 py-1 text-xs bg-[#E8762D]/10 text-[#E8762D] border border-[#E8762D]/30 hidden sm:inline">
								{userRole}
							</span>
						)}
					</div>

					{/* Mobile menu button */}
					<Button
						variant="ghost"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						className="md:hidden text-[#E8762D] hover:bg-[#E8762D]/10 p-2"
					>
						{mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
					</Button>
				</div>
			</div>

			{/* Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="md:hidden bg-black/90 border-b border-[#E8762D]/10">
					<nav className="container mx-auto p-4 space-y-2">
						{adminNavItems.map((item) => {
							const IconComponent = item.icon;
							const isActive = pathname === item.href;
							return (
								<Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
									<div
										className={`flex items-center gap-3 px-4 py-3 transition-all duration-200 cursor-pointer ${
											isActive
												? "bg-[#E8762D]/20 text-[#E8762D] border border-[#E8762D]/30"
												: "text-gray-400 hover:text-white hover:bg-white/5"
										}`}
									>
										<IconComponent className="w-5 h-5" />
										<div className="flex-1">
											<span className="text-sm font-medium block">{item.title}</span>
											<span className="text-xs text-gray-500 block">{item.description}</span>
										</div>
									</div>
								</Link>
							);
						})}
					</nav>
				</div>
			)}

			{/* Desktop Navigation */}
			<div className="hidden md:block bg-black/30 border-b border-[#E8762D]/10 p-4">
				<div className="container mx-auto">
					<nav className="flex items-center gap-6">
						{adminNavItems.map((item) => {
							const IconComponent = item.icon;
							const isActive = pathname === item.href;
							return (
								<Link key={item.href} href={item.href}>
									<div
										className={`flex items-center gap-2 px-3 py-2 transition-all duration-200 cursor-pointer whitespace-nowrap ${
											isActive
												? "bg-[#E8762D]/20 text-[#E8762D] border border-[#E8762D]/30"
												: "text-gray-400 hover:text-white hover:bg-white/5"
										}`}
									>
										<IconComponent className="w-4 h-4" />
										<span className="text-sm font-medium">{item.title}</span>
									</div>
								</Link>
							);
						})}
					</nav>
				</div>
			</div>

			<main className="min-h-[calc(100vh-120px)]">{children}</main>
		</div>
	);
}
