import type { IToken, TChainId } from "@autofun/types";
import ConnectToFleek from "../connect-fleek";
import FleekAgent from "../fleek-agent";
import { getAgent } from "@/lib/api";
import { useWallets } from "../hooks/providers/UseWalletContext";

export default async function Agents({ token }: { token: IToken }) {
	const data = await getAgent({
		contractAddress: token.contractAddress,
		chain: token.chain,
		chainId: token.chainId as TChainId,
	});
	const agents = data?.docs;

	// TODO: Make the current logic work with the new wallet configuration
	const wallets = useWallets();

	const connectedWalletAddresses = [
		...Object.values(wallets.evmWallets || {}).map((w) => w.address),
		...Object.values(wallets.solanaWallets || {}).map((w) => w.address),
	];

	const isCreatorConnected = token.creator ? connectedWalletAddresses.includes(token.creator) : false;

	return (
		<div className="w-full space-y-4">
			{!agents ? (
				<div className="bg-[#0F0F0F] w-fit place-self-center p-5 rounded-md">
					<h1 className="text-white place-self-center text-lg font-semibold">
						No Agents have been connected to this token
					</h1>
				</div>
			) : null}
			{agents ? (
				<FleekAgent agents={agents} />
			) : isCreatorConnected ? (
				<div className="mt-4">
					<ConnectToFleek token={token} />
				</div>
			) : null}
		</div>
	);
}
