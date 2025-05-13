

export default function WalletConnectModal() {
    return (
        <div className="fixed inset-0 flex items-center justify-center backdrop-blur-lg z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-[400px]">
                <h2 className="text-xl font-bold mb-4">Connect Wallet</h2>
                <p className="mb-4">Please select a chain to connect:</p>
                <div className="flex flex-col gap-4">
                    <button className="bg-blue-500 text-white py-2 px-4 rounded">EVM</button>
                    <button className="bg-blue-500 text-white py-2 px-4 rounded">Solana</button>
                </div>
            </div>
        </div>
    );
}