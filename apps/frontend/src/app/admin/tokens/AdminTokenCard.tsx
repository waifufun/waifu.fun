import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Shield, Star } from "lucide-react";

export interface Token {
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

interface AdminTokenCardProps {
	token: Token;
	onVerify: (token: Token) => void;
	onUnverify: (token: Token) => void;
	onToggleHidden: (token: Token) => void;
	onToggleFeatured: (token: Token) => void;
	onEdit: (token: Token) => void;
	formatVolume: (v: number) => string;
	formatMarketCap: (v: number) => string;
}

export default function AdminTokenCard({
	token,
	onVerify,
	onUnverify,
	onToggleHidden,
	onToggleFeatured,
	onEdit,
	formatVolume,
	formatMarketCap,
}: AdminTokenCardProps) {
	return (
		<div className="border  p-4 bg-card hover:bg-zinc-800 transition-colors duration-150 shadow-sm">
			<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2 gap-y-1 mb-2 min-w-0">
						{token.image ? (
							<img
								src={token.image}
								alt={token.name}
								className="w-8 h-8 object-cover border border-gray-700 bg-gray-800"
							/>
						) : (
							<div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
								{token.ticker?.slice(0, 2) || "TK"}
							</div>
						)}
						<h3 className="font-semibold text-base md:text-lg truncate max-w-[90vw] md:max-w-xs">{token.name}</h3>
						<Badge variant="secondary">{token.ticker}</Badge>
						{token.verified && (
							<Badge variant="default" className="bg-green-100 text-green-800">
								<Shield className="h-3 w-3 mr-1" />
								Verified
							</Badge>
						)}
						{token.featured && (
							<Badge variant="default" className="bg-yellow-100 text-yellow-800">
								<Star className="h-3 w-3 mr-1" />
								Featured
							</Badge>
						)}
						{token.hidden && (
							<Badge variant="destructive">
								<EyeOff className="h-3 w-3 mr-1" />
								Hidden
							</Badge>
						)}
						{token.imported && <Badge variant="outline">Imported</Badge>}
					</div>
					<p className="text-sm text-muted-foreground mb-2 break-all">
						{token.contractAddress} • {token.chain}:{token.chainId}
					</p>
					<div className="flex flex-wrap gap-4 text-xs md:text-sm">
						<span>Volume: {formatVolume(token.volume24h)}</span>
						<span>Market Cap: {formatMarketCap(token.marketCap)}</span>
						<span>Created: {new Date(token.createdAt).toLocaleDateString()}</span>
					</div>
					{token.socials && (
						<div className="flex flex-wrap gap-2 mt-2">
							{token.socials.twitter && (
								<a
									href={token.socials.twitter}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-500 hover:underline text-xs md:text-sm"
								>
									Twitter
								</a>
							)}
							{token.socials.telegram && (
								<a
									href={token.socials.telegram}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-500 hover:underline text-xs md:text-sm"
								>
									Telegram
								</a>
							)}
							{token.socials.website && (
								<a
									href={token.socials.website}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-500 hover:underline text-xs md:text-sm"
								>
									Website
								</a>
							)}
						</div>
					)}
				</div>
				<div className="flex flex-wrap gap-2 w-full md:w-auto">
					{token.verified ? (
						<Button size="sm" variant="destructive" onClick={() => onUnverify(token)}>
							<Shield className="h-4 w-4 mr-1" />
							Unverify
						</Button>
					) : (
						<Button size="sm" onClick={() => onVerify(token)} className="bg-green-600 hover:bg-green-700">
							<Shield className="h-4 w-4 mr-1" />
							Verify
						</Button>
					)}
					<Button size="sm" variant={token.hidden ? "default" : "outline"} onClick={() => onToggleHidden(token)}>
						{token.hidden ? (
							<>
								<Eye className="h-4 w-4 mr-1" />
								Unhide
							</>
						) : (
							<>
								<EyeOff className="h-4 w-4 mr-1" />
								Hide
							</>
						)}
					</Button>
					<Button size="sm" variant={token.featured ? "default" : "outline"} onClick={() => onToggleFeatured(token)}>
						<Star className="h-4 w-4 mr-1" />
						{token.featured ? "Unfeature" : "Feature"}
					</Button>
					<Button size="sm" variant="outline" onClick={() => onEdit(token)}>
						Edit
					</Button>
				</div>
			</div>
		</div>
	);
}
