// "use client";
// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { getAdminStatus, getAuthStatus, createPresale } from "@/lib/api";
// import { Card, CardContent } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { ArrowLeft, Shield } from "lucide-react";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import type { CreatePresaleBody, AddressLike } from "@autofun/types";
// import {
// 	BasicInfoForm,
// 	FundingForm,
// 	TimelineForm,
// 	TokenomicsForm,
// 	SocialLinksForm,
// 	FormActions,
// } from "@/components/incubator/admin";
// import { useActionState } from "react";
// import type { FormState } from "@/components/incubator/types/presale-form";

// async function onInputChangeAction(prevState: FormState, formData: FormData) {
// 	const field = formData.get("field") as string;
// 	const value = formData.get("value") as string;

// 	return {
// 		...prevState,
// 		[field]: value,
// 	} as FormState;
// }

// async function onSubmitAction(prevState: FormState, _formData: FormData) {
// 	return prevState;
// }

// async function onCancelAction(prevState: FormState, _formData: FormData) {
// 	return prevState;
// }

// export default function IncubatorAdminCreatePage() {
// 	const router = useRouter();
// 	const [isLoading, setIsLoading] = useState(true);
// 	const [isAdmin, setIsAdmin] = useState(false);
// 	const [formData, dispatch] = useActionState(onInputChangeAction, {
// 		name: "",
// 		symbol: "",
// 		description: "",
// 		image: "",
// 		contractAddress: "",
// 		targetAmount: "",
// 		targetAmountUsd: "",
// 		pricePerToken: "",
// 		pricePerTokenUsd: "",
// 		minimumInvestment: "",
// 		maximumInvestment: "",
// 		startDate: "",
// 		endDate: "",
// 		claimDate: "",
// 		presaleAllocation: "",
// 		liquidityAllocation: "",
// 		teamAllocation: "",
// 		marketingAllocation: "",
// 		developmentAllocation: "",
// 		communityAllocation: "",
// 		totalSupply: "1000000000",
// 		decimals: "9",
// 		chain: "solana",
// 		chainId: 101,
// 		currency: "SOL",
// 		softCap: "",
// 		hardCap: "",
// 		vesting: "No vesting",
// 		creator: "",
// 		website: "",
// 		telegram: "",
// 		twitter: "",
// 		discord: "",
// 		github: "",
// 		whitepaper: "",
// 	} as FormState);

// 	useEffect(() => {
// 		const checkAdminStatus = async () => {
// 			try {
// 				const authStatus = await getAuthStatus();
// 				if (!authStatus.authenticated) {
// 					setIsLoading(false);
// 					return;
// 				}

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

// 	const [isSubmitting, setIsSubmitting] = useState(false);
// 	const [error, setError] = useState<string | null>(null);
// 	const [isSuccess, setIsSuccess] = useState(false);

// 	const handleSubmit = async () => {
// 		setIsSubmitting(true);
// 		setError(null);
// 		setIsSuccess(false);

// 		try {
// 			const requiredFields = [
// 				"name",
// 				"symbol",
// 				"description",
// 				"contractAddress",
// 				"targetAmount",
// 				"pricePerToken",
// 				"startDate",
// 				"endDate",
// 				"presaleAllocation",
// 				"liquidityAllocation",
// 				"teamAllocation",
// 				"minimumInvestment",
// 				"maximumInvestment",
// 				"creator",
// 			];

// 			for (const field of requiredFields) {
// 				if (!formData[field as keyof typeof formData]) {
// 					throw new Error(`${field.charAt(0).toUpperCase() + field.slice(1)} is required`);
// 				}
// 			}

// 			const presaleData: CreatePresaleBody = {
// 				totalSupply: Number.parseInt(formData.totalSupply),
// 				decimals: Number.parseInt(formData.decimals),
// 				...(formData.image && { image: formData.image }),
// 				tokenomics: {
// 					presaleAllocation: Number.parseFloat(formData.presaleAllocation),
// 					liquidityAllocation: Number.parseFloat(formData.liquidityAllocation),
// 					teamAllocation: Number.parseFloat(formData.teamAllocation),
// 					vesting: formData.vesting,
// 				},
// 				raise: {
// 					targetAmount: Number.parseFloat(formData.targetAmount),
// 					targetAmountUsd: Number.parseFloat(formData.targetAmountUsd) || 0,
// 					pricePerToken: Number.parseFloat(formData.pricePerToken),
// 					pricePerTokenUsd: Number.parseFloat(formData.pricePerTokenUsd) || 0,
// 					currency: formData.currency,
// 					minGoal: Number.parseFloat(formData.softCap) || Number.parseFloat(formData.targetAmount) * 0.5,
// 					maxGoal: Number.parseFloat(formData.hardCap) || Number.parseFloat(formData.targetAmount) * 1.5,
// 				},
// 				schedule: {
// 					startDate: formData.startDate,
// 					endDate: formData.endDate,
// 					...(formData.claimDate ? { claimDate: formData.claimDate } : {}),
// 				},
// 				allocations: {
// 					presale: {
// 						percentage: Number.parseFloat(formData.presaleAllocation),
// 						amount: Number.parseInt(formData.totalSupply) * (Number.parseFloat(formData.presaleAllocation) / 100),
// 						price: Number.parseFloat(formData.pricePerToken),
// 					},
// 					liquidity: {
// 						percentage: Number.parseFloat(formData.liquidityAllocation),
// 						amount: Number.parseInt(formData.totalSupply) * (Number.parseFloat(formData.liquidityAllocation) / 100),
// 						lockDuration: 90,
// 					},
// 				},
// 				utility: {
// 					description: formData.description,
// 					features: [],
// 					useCases: [],
// 					benefits: [],
// 				},
// 				roadmap: {
// 					phases: [],
// 				},
// 				team: {
// 					members: [],
// 					description: "Team information to be added",
// 				},
// 				socials: {},
// 				kyc: { completed: false },
// 				audit: { completed: false },
// 				settings: {
// 					minimumInvestment: Number.parseFloat(formData.minimumInvestment),
// 					maximumInvestment: Number.parseFloat(formData.maximumInvestment),
// 					refundable: false,
// 					whitelistRequired: false,
// 					kycRequired: false,
// 					vestingEnabled: false,
// 				},
// 				metadata: {},
// 				description: formData.description,
// 				chain: formData.chain as "solana",
// 				chainId: formData.chainId,
// 				contractAddress: formData.contractAddress as AddressLike,
// 				name: formData.name,
// 				symbol: formData.symbol,
// 				creator: formData.creator as AddressLike,
// 			};

// 			const result = await createPresale(presaleData);

// 			if (result.success) {
// 				setIsSuccess(true);
// 				setTimeout(() => {
// 					router.push("/incubator/admin");
// 				}, 2000);
// 			} else {
// 				setError(result.error || "Failed to create presale");
// 			}
// 		} catch (error) {
// 			console.error("Error creating presale:", error);
// 			setError(error instanceof Error ? error.message : "Failed to create presale");
// 		} finally {
// 			setIsSubmitting(false);
// 		}
// 	};

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
// 			<div className="bg-black/50 border-b border-[#03FF24]/20 p-4">
// 				<div className="container mx-auto flex items-center justify-between">
// 					<div className="flex items-center gap-2 md:gap-4">
// 						<Button
// 							variant="ghost"
// 							onClick={() => router.push("/incubator/admin")}
// 							className="text-[#03FF24] hover:bg-[#03FF24]/10 p-2 md:p-2"
// 						>
// 							<ArrowLeft className="w-4 h-4 md:mr-2" />
// 							<span className="hidden md:inline">Back to Admin</span>
// 						</Button>
// 						<div className="hidden md:block h-6 w-px bg-[#03FF24]/30" />
// 						<h1 className="text-lg md:text-xl font-bold text-white">Create Presale</h1>
// 						<span className="px-2 py-1 text-xs bg-[#03FF24]/10 text-[#03FF24] border border-[#03FF24]/30 hidden sm:inline">
// 							Admin
// 						</span>
// 					</div>
// 				</div>
// 			</div>

// 			<div className="container mx-auto px-4 py-8">
// 				<div className="mb-8">
// 					<h2 className="text-3xl font-bold text-[#03FF23] mb-2">Create New Presale</h2>
// 					<p className="text-gray-400">Set up a new incubator presale campaign</p>
// 				</div>

// 				<div className="max-w-4xl mx-auto">
// 					<Tabs defaultValue="basic" className="w-full">
// 						<TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 bg-black border-2 border-[#03FF24]/50 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.3)] mb-6">
// 							<TabsTrigger
// 								value="basic"
// 								className="text-xs sm:text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black]
//                      text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider w-full"
// 							>
// 								<span className="hidden sm:inline">Basic Info</span>
// 								<span className="sm:hidden">Basic</span>
// 							</TabsTrigger>
// 							<TabsTrigger
// 								value="funding"
// 								className="text-xs sm:text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black]
//                      text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider w-full"
// 							>
// 								Funding
// 							</TabsTrigger>
// 							<TabsTrigger
// 								value="tokenomics"
// 								className="text-xs sm:text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black]
//                      text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider w-full"
// 							>
// 								<span className="hidden sm:inline">Tokenomics</span>
// 								<span className="sm:hidden">Token</span>
// 							</TabsTrigger>
// 							<TabsTrigger
// 								value="schedule"
// 								className="text-xs sm:text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black]
//                      text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider w-full"
// 							>
// 								Schedule
// 							</TabsTrigger>
// 							<TabsTrigger
// 								value="socials"
// 								className="text-xs sm:text-sm data-[state=active]:bg-[#03FF24] data-[state=active]:text-black data-[state=active]:shadow-[inset_0px_0px_0px_2px_black]
//                      text-gray-300 hover:text-[#03FF24] hover:bg-[#03FF24]/10 rounded-none py-3 font-bold uppercase tracking-wider w-full"
// 							>
// 								<span className="hidden sm:inline">Social Links</span>
// 								<span className="sm:hidden">Social</span>
// 							</TabsTrigger>
// 						</TabsList>

// 						<TabsContent value="basic" className="space-y-6">
// 							<BasicInfoForm formData={formData} onInputChangeAction={dispatch} />
// 						</TabsContent>

// 						<TabsContent value="funding" className="space-y-6">
// 							<FundingForm formData={formData} onInputChangeAction={dispatch} />
// 						</TabsContent>

// 						<TabsContent value="tokenomics" className="space-y-6">
// 							<TokenomicsForm formData={formData} onInputChangeAction={dispatch} />
// 						</TabsContent>

// 						<TabsContent value="schedule" className="space-y-6">
// 							<TimelineForm formData={formData} onInputChangeAction={dispatch} />
// 						</TabsContent>

// 						<TabsContent value="socials" className="space-y-6">
// 							<SocialLinksForm formData={formData} onInputChangeAction={dispatch} />
// 						</TabsContent>
// 					</Tabs>

// 					<div className="mt-8">
// 						<FormActions
// 							isLoading={isSubmitting}
// 							isSuccess={isSuccess}
// 							error={error}
// 							onSubmitAction={onSubmitAction}
// 							onCancelAction={onCancelAction}
// 							onSubmitClient={handleSubmit}
// 							onCancelClient={() => router.push("/incubator/admin")}
// 							canSubmit={true}
// 						/>
// 					</div>
// 				</div>
// 			</div>
// 		</div>
// 	);
// }
