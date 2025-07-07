// "use client";
// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { getAdminStatus, getAuthStatus } from "@/lib/api";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { ArrowLeft, Shield, Plus, Users, TrendingUp, Clock } from "lucide-react";
// import Link from "next/link";

// export default function IncubatorAdminPage() {
// 	const router = useRouter();
// 	const [isLoading, setIsLoading] = useState(true);
// 	const [isAdmin, setIsAdmin] = useState(false);

// 	useEffect(() => {
// 		const checkAdminStatus = async () => {
// 			try {
// 				// First check if user is authenticated
// 				const authStatus = await getAuthStatus();
// 				if (!authStatus.authenticated) {
// 					setIsLoading(false);
// 					return;
// 				}

// 				// Then check admin status
// 				const adminStatus = await getAdminStatus();
// 				if (!adminStatus.success || !adminStatus.isAdmin) {
// 					router.push("/incubator");
// 					return;
// 				}

// 				setIsAdmin(true);
// 			} catch (error) {
// 				console.error("Failed to check admin status:", error);
// 				router.push("/incubator");
// 			} finally {
// 				setIsLoading(false);
// 			}
// 		};

// 		checkAdminStatus();
// 	}, [router]);

// 	if (isLoading) {
// 		return (
// 			<div className="min-h-screen bg-black flex items-center justify-center">
// 				<Card className="bg-black/20 border-[#03FF24]/20 w-96">
// 					<CardContent className="p-6">
// 						<div className="flex items-center justify-center">
// 							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#03FF24]" />
// 							<span className="ml-3 text-white">Checking admin access...</span>
// 						</div>
// 					</CardContent>
// 				</Card>
// 			</div>
// 		);
// 	}

// 	if (!isAdmin) {
// 		return (
// 			<div className="min-h-screen bg-black flex items-center justify-center">
// 				<Card className="bg-black/20 border-[#03FF24]/20 w-96">
// 					<CardContent className="p-6 text-center">
// 						<Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
// 						<h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
// 						<p className="text-gray-400 mb-4">You don't have permission to access the incubator admin panel.</p>
// 						<Button onClick={() => router.push("/incubator")} className="w-full">
// 							<ArrowLeft className="w-4 h-4 mr-2" />
// 							Back to Incubator
// 						</Button>
// 					</CardContent>
// 				</Card>
// 			</div>
// 		);
// 	}

// 	return (
// 		<div className="min-h-screen bg-black">
// 			{/* Header */}
// 			<div className="bg-black/50 border-b border-[#03FF24]/20 p-4">
// 				<div className="container mx-auto flex items-center justify-between">
// 					<div className="flex items-center gap-2 md:gap-4">
// 						<Button
// 							variant="ghost"
// 							onClick={() => router.push("/incubator")}
// 							className="text-[#03FF24] hover:bg-[#03FF24]/10 p-2 md:p-2"
// 						>
// 							<ArrowLeft className="w-4 h-4 md:mr-2" />
// 							<span className="hidden md:inline">Back to Incubator</span>
// 						</Button>
// 						<div className="hidden md:block h-6 w-px bg-[#03FF24]/30" />
// 						<h1 className="text-lg md:text-xl font-bold text-white">Incubator Admin</h1>
// 						<span className="px-2 py-1 text-xs bg-[#03FF24]/10 text-[#03FF24] border border-[#03FF24]/30 hidden sm:inline">
// 							Admin
// 						</span>
// 					</div>
// 				</div>
// 			</div>

// 			{/* Main Content */}
// 			<div className="container mx-auto px-4 py-8">
// 				<div className="mb-8">
// 					<h2 className="text-3xl font-bold text-[#03FF23] mb-2">Presale Management</h2>
// 					<p className="text-gray-400">Create and manage incubator presale campaigns</p>
// 				</div>

// 				{/* Quick Actions */}
// 				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
// 					<Card className="bg-black border-[#03FF24]/20 hover:border-[#03FF24]/40 transition-colors">
// 						<CardContent className="p-6">
// 							<div className="flex items-center gap-3 mb-4">
// 								<Plus className="h-8 w-8 text-[#03FF24]" />
// 								<div>
// 									<h3 className="text-lg font-semibold text-white">Create Presale</h3>
// 									<p className="text-sm text-gray-400">Start a new presale campaign</p>
// 								</div>
// 							</div>
// 							<Link href="/incubator/admin/create">
// 								<Button className="w-full bg-[#03FF24] text-black hover:bg-[#03FF24]/90">Create New</Button>
// 							</Link>
// 						</CardContent>
// 					</Card>

// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardContent className="p-6">
// 							<div className="flex items-center gap-3 mb-4">
// 								<TrendingUp className="h-8 w-8 text-[#03FF24]" />
// 								<div>
// 									<h3 className="text-lg font-semibold text-white">Active Presales</h3>
// 									<p className="text-sm text-gray-400">Manage live campaigns</p>
// 								</div>
// 							</div>
// 							<Link href="/incubator/admin/presales">
// 								<Button variant="outline" className="w-full border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10">
// 									View All
// 								</Button>
// 							</Link>
// 						</CardContent>
// 					</Card>

// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardContent className="p-6">
// 							<div className="flex items-center gap-3 mb-4">
// 								<Users className="h-8 w-8 text-[#03FF24]" />
// 								<div>
// 									<h3 className="text-lg font-semibold text-white">Participants</h3>
// 									<p className="text-sm text-gray-400">View participant data</p>
// 								</div>
// 							</div>
// 							<Link href="/incubator/admin/participants">
// 								<Button variant="outline" className="w-full border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10">
// 									View Data
// 								</Button>
// 							</Link>
// 						</CardContent>
// 					</Card>

// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardContent className="p-6">
// 							<div className="flex items-center gap-3 mb-4">
// 								<Clock className="h-8 w-8 text-[#03FF24]" />
// 								<div>
// 									<h3 className="text-lg font-semibold text-white">Scheduled</h3>
// 									<p className="text-sm text-gray-400">Upcoming presales</p>
// 								</div>
// 							</div>
// 							<Link href="/incubator/admin/scheduled">
// 								<Button variant="outline" className="w-full border-[#03FF24]/50 text-[#03FF24] hover:bg-[#03FF24]/10">
// 									View Schedule
// 								</Button>
// 							</Link>
// 						</CardContent>
// 					</Card>
// 				</div>

// 				{/* Stats Overview */}
// 				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardHeader>
// 							<CardTitle className="text-[#03FF24]">Total Presales</CardTitle>
// 						</CardHeader>
// 						<CardContent>
// 							<p className="text-3xl font-bold text-white">24</p>
// 							<p className="text-sm text-gray-400">Active: 8 | Completed: 12 | Draft: 4</p>
// 						</CardContent>
// 					</Card>

// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardHeader>
// 							<CardTitle className="text-[#03FF24]">Total Raised</CardTitle>
// 						</CardHeader>
// 						<CardContent>
// 							<p className="text-3xl font-bold text-white">1,247 SOL</p>
// 							<p className="text-sm text-gray-400">Across all presales</p>
// 						</CardContent>
// 					</Card>

// 					<Card className="bg-black border-[#03FF24]/20">
// 						<CardHeader>
// 							<CardTitle className="text-[#03FF24]">Total Participants</CardTitle>
// 						</CardHeader>
// 						<CardContent>
// 							<p className="text-3xl font-bold text-white">3,421</p>
// 							<p className="text-sm text-gray-400">Unique participants</p>
// 						</CardContent>
// 					</Card>
// 				</div>
// 			</div>
// 		</div>
// 	);
// }
