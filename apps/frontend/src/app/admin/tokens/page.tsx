"use client";

import { Button } from "@/components/ui/button";
import {
	getAdminTokenStats,
	getAdminTokens,
	setTokenFeatured,
	setTokenHidden,
	setTokenVerified,
	updateTokenMetadata,
	updateTokenSocials,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import AdminTokenCard from "./AdminTokenCard";
import AdminTokenFilters from "./AdminTokenFilters";
import AdminTokenStats from "./AdminTokenStats";
import EditTokenModal from "./EditTokenModal";

interface Token {
	_id: string;
	contractAddress: string;
	name: string;
	ticker: string;
	chain: string;
	chainId: string;
	verified: boolean;
	featured: boolean;
	hidden: boolean;
	imported: boolean;
	volume24h: number;
	marketCap: number;
	createdAt: string;
	socials?: {
		twitter?: string;
		telegram?: string;
		discord?: string;
		website?: string;
	};
	image?: string;
	description?: string;
}

interface TokenStats {
	totalTokens: number;
	verifiedCount: number;
	featuredCount: number;
	hiddenCount: number;
	totalVolume: number;
}

export default function AdminTokensPage() {
	const [search, setSearch] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [sortBy, setSortBy] = useState("createdAt");
	const [sortOrder, setSortOrder] = useState("desc");
	const [hideImported, setHideImported] = useState(false);
	const [selectedChain, setSelectedChain] = useState<string>("");
	const [selectedChainId, setSelectedChainId] = useState<string>("");
	const [editToken, setEditToken] = useState<Token | null>(null);
	const [editLoading, setEditLoading] = useState(false);

	const {
		data: tokensData,
		isLoading: tokensLoading,
		refetch: refetchTokens,
	} = useQuery({
		queryKey: ["admin-tokens", currentPage, sortBy, sortOrder, hideImported, selectedChain, selectedChainId],
		queryFn: () =>
			getAdminTokens({
				page: currentPage,
				limit: 20,
				sortBy,
				sortOrder,
				hideImported: hideImported ? 1 : 0,
				...(selectedChain && { chain: selectedChain }),
				...(selectedChainId && { chainId: selectedChainId }),
			}),
	});

	const { data: statsData, isLoading: statsLoading } = useQuery({
		queryKey: ["admin-token-stats"],
		queryFn: getAdminTokenStats,
	});

	const { data: searchData, isLoading: searchLoading } = useQuery({
		queryKey: ["admin-tokens-search", search],
		queryFn: () =>
			getAdminTokens({
				search,
				page: 1,
				limit: 5,
				sortBy: "createdAt",
				sortOrder: "desc",
			}),
		enabled: search.length > 0,
	});

	const handleVerifyToken = async (token: Token) => {
		try {
			await setTokenVerified(token.contractAddress, true);
			toast.success("Token verified successfully");
			refetchTokens();
		} catch (error) {
			toast.error("Error verifying token");
		}
	};

	const handleUnverifyToken = async (token: Token) => {
		try {
			await setTokenVerified(token.contractAddress, false);
			toast.success("Token unverified successfully");
			refetchTokens();
		} catch (error) {
			toast.error("Error unverifying token");
		}
	};

	const handleToggleHidden = async (token: Token) => {
		try {
			await setTokenHidden({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				hidden: !token.hidden,
			});
			toast.success(`Token ${token.hidden ? "unhidden" : "hidden"} successfully`);
			refetchTokens();
		} catch (error) {
			toast.error("Error updating token visibility");
		}
	};

	const handleToggleFeatured = async (token: Token) => {
		try {
			await setTokenFeatured({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				featured: !token.featured,
			});
			toast.success(`Token ${token.featured ? "unfeatured" : "featured"} successfully`);
			refetchTokens();
		} catch (error) {
			toast.error("Error updating token featured status");
		}
	};

	const handleEditToken = async (
		token: Token,
		socials: { twitter?: string; telegram?: string; discord?: string; website?: string },
		description: string,
	) => {
		setEditLoading(true);
		try {
			await updateTokenSocials({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				socials,
			});
			await updateTokenMetadata({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				metadata: { description },
			});
			toast.success("Token updated");
			setEditToken(null);
			refetchTokens();
		} catch (e) {
			toast.error("Failed to update token");
		} finally {
			setEditLoading(false);
		}
	};

	const displayData = search.length > 0 ? searchData : tokensData;
	const isLoading = search.length > 0 ? searchLoading : tokensLoading;

	const formatVolume = (volume: number) => {
		if (!volume || Number.isNaN(volume)) return "$0.00";
		if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
		if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
		if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
		return `$${volume.toFixed(2)}`;
	};

	const formatMarketCap = (marketCap: number) => {
		if (!marketCap || Number.isNaN(marketCap)) return "$0.00";
		if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
		if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
		if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}K`;
		return `$${marketCap.toFixed(2)}`;
	};

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div className="flex justify-between items-center">
				<h1 className="text-3xl font-bold">Token Management</h1>
			</div>

			{/* Stats Cards */}
			{!statsLoading && statsData && <AdminTokenStats stats={statsData} formatVolume={formatVolume} />}

			{/* Search and Filters */}
			<AdminTokenFilters
				search={search}
				setSearch={setSearch}
				hideImported={hideImported}
				setHideImported={setHideImported}
				sortBy={sortBy}
				setSortBy={setSortBy}
				sortOrder={sortOrder}
				setSortOrder={setSortOrder}
				selectedChain={selectedChain}
				setSelectedChain={setSelectedChain}
			/>

			{/* Tokens List */}
			<div className="bg-card shadow p-4">
				{isLoading ? (
					<div className="text-center py-8">Loading tokens...</div>
				) : displayData?.tokens?.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">No tokens found</div>
				) : (
					<div className="space-y-4">
						{displayData?.tokens?.map((token: Token) => (
							<AdminTokenCard
								key={token._id}
								token={token}
								onVerify={handleVerifyToken}
								onUnverify={handleUnverifyToken}
								onToggleHidden={handleToggleHidden}
								onToggleFeatured={handleToggleFeatured}
								onEdit={setEditToken}
								formatVolume={formatVolume}
								formatMarketCap={formatMarketCap}
							/>
						))}
					</div>
				)}

				{/* Pagination */}
				{!search && tokensData && tokensData.totalPages > 1 && (
					<div className="flex justify-center gap-2 mt-6">
						<Button variant="outline" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
							Previous
						</Button>
						<span className="flex items-center px-4">
							Page {currentPage} of {tokensData.totalPages}
						</span>
						<Button
							variant="outline"
							onClick={() => setCurrentPage(currentPage + 1)}
							disabled={currentPage === tokensData.totalPages}
						>
							Next
						</Button>
					</div>
				)}
			</div>

			{/* Edit Token Modal */}
			{editToken && (
				<EditTokenModal
					open={!!editToken}
					onClose={() => setEditToken(null)}
					token={editToken}
					onSave={async (socials, description) => {
						await handleEditToken(editToken, socials, description);
					}}
					loading={editLoading}
				/>
			)}
		</div>
	);
}
