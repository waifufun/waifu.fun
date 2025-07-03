import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminTokenStatsProps {
	stats: {
		totalTokens: number;
		verifiedCount: number;
		featuredCount: number;
		hiddenCount: number;
		totalVolume: number;
	};
	formatVolume: (v: number) => string;
}

export default function AdminTokenStats({ stats, formatVolume }: AdminTokenStatsProps) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{stats.totalTokens || 0}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">Verified</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-green-600">{stats.verifiedCount || 0}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">Featured</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-yellow-600">{stats.featuredCount || 0}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">Hidden</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold text-red-600">{stats.hiddenCount || 0}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">24h Volume</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">{formatVolume(stats.totalVolume || 0)}</div>
				</CardContent>
			</Card>
		</div>
	);
}
