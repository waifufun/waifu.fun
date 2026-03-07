import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter, Search } from "lucide-react";

interface AdminTokenFiltersProps {
	search: string;
	setSearch: (v: string) => void;
	hideImported: boolean;
	setHideImported: (v: boolean) => void;
	sortBy: string;
	setSortBy: (v: string) => void;
	sortOrder: string;
	setSortOrder: (v: string) => void;
	selectedChain: string;
	setSelectedChain: (v: string) => void;
}

export default function AdminTokenFilters({
	search,
	setSearch,
	hideImported,
	setHideImported,
	sortBy,
	setSortBy,
	sortOrder,
	setSortOrder,
	selectedChain,
	setSelectedChain,
}: AdminTokenFiltersProps) {
	return (
		<div className="bg-card border-b border-[#00ff87]/10 p-4 mb-4">
			<div className="flex items-center gap-2 mb-4">
				<Filter className="h-5 w-5" />
				<span className="font-semibold">Search & Filters</span>
			</div>
			<div className="flex flex-col md:flex-row gap-3 md:gap-4 mb-4">
				<div className="flex-1">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
						<Input
							placeholder="Search tokens by name or address..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-10 w-full"
						/>
					</div>
				</div>
				<Button
					variant="outline"
					onClick={() => setHideImported(!hideImported)}
					className={`w-full md:w-auto ${hideImported ? "bg-blue-50 border-blue-200" : ""}`}
				>
					{hideImported ? "Showing Custom" : "Show All"}
				</Button>
			</div>
			<div className="flex flex-col md:flex-row gap-3 md:gap-4">
				<select
					value={sortBy}
					onChange={(e) => setSortBy(e.target.value)}
					className="px-3 py-2 border bg-zinc-900 text-white w-full md:w-auto"
				>
					<option value="createdAt">Created Date</option>
					<option value="volume24h">Volume 24h</option>
					<option value="marketCap">Market Cap</option>
					<option value="name">Name</option>
				</select>
				<select
					value={sortOrder}
					onChange={(e) => setSortOrder(e.target.value)}
					className="px-3 py-2 border bg-zinc-900 text-white w-full md:w-auto"
				>
					<option value="desc">Descending</option>
					<option value="asc">Ascending</option>
				</select>
				<select
					value={selectedChain}
					onChange={(e) => setSelectedChain(e.target.value)}
					className="px-3 py-2 border bg-zinc-900 text-white w-full md:w-auto"
				>
					<option value="">All Chains</option>
					<option value="ethereum">Ethereum</option>
					<option value="polygon">Polygon</option>
					<option value="bsc">BSC</option>
					<option value="solana">Solana</option>
				</select>
			</div>
		</div>
	);
}
