import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallets } from "../providers/UseWalletContext";
import { shortenAddress } from "@/lib/utils";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAppKit, useDisconnect } from "@reown/appkit/react";

export default function WalletConnectModal({
	onClose,
}: {
	onClose: () => void;
}) {
	const { setVisible } = useWalletModal();
	const { disconnect: disconnectSol } = useWallet();
	const { evmWallets, solanaWallets } = useWallets();
	const { open, close } = useAppKit();
	const { disconnect: disconnectEVM } = useDisconnect();
	return (
		<div className="bg-gray-900 rounded-lg shadow-lg p-6 w-[400px]">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-xl font-bold ">Connect Wallet</h2>
				<button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 hover:cursor-pointer">
					<img src="/util-icons/close.svg" alt="Close" className="w-6 h-6" />
				</button>
			</div>
			<p className="mb-4">Please select a chain to connect:</p>
			<div className="flex flex-col gap-4">
				<button
					type="button"
					onClick={() => {
						if (!evmWallets?.BaseMainnet.address) {
							open();
						} else {
							disconnectEVM();
						}
					}}
					className="bg-blue-500 text-white py-2 px-4 rounded hover:cursor-pointer"
				>
					{evmWallets?.BaseMainnet?.address ? shortenAddress(evmWallets.BaseMainnet.address) : "Connect EVM Wallet"}
				</button>
				<button
					type="button"
					onClick={() => {
						if (!solanaWallets?.Mainnet.address) {
							setVisible(true);
						} else {
							disconnectSol();
						}
					}}
					className="bg-blue-500 text-white py-2 px-4 rounded hover:cursor-pointer"
				>
					{solanaWallets?.Mainnet?.address ? shortenAddress(solanaWallets.Mainnet.address) : "Connect Solana Wallet"}
				</button>
			</div>
		</div>
	);
}
