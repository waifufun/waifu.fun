import { createPublicClient, http, isAddress, formatEther } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js'; 
// import { EVM_RPC_URLS } from "@autofun/constants"


// API Keys from your environment variables
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;


export default async function checkWalletBalance(walletAddress: string): Promise<{ blockchain: string; balance: string } | { error: string }> {
    const isEvmAddress = isAddress(walletAddress);
    try {
        if (isEvmAddress) {
            const blockchain = 'ethereum';
            if (!ALCHEMY_API_KEY) throw new Error("No Alchemy API key is set")
            const alchemyRpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
            const ethClient = createPublicClient({
                transport: http(alchemyRpcUrl),
            });
            try {
                const balanceWei = await ethClient.getBalance({ address: walletAddress as `0x${string}` });
                const balance = formatEther(balanceWei);
                return { blockchain, balance };
            } catch (error: any) {
                return { error: `Error fetching Ethereum balance via Alchemy: ${error.message}` };
            }
        } else if (!isEvmAddress) {
            const blockchain = 'solana';
            if (!HELIUS_API_KEY) {
                return { error: 'HELIUS_API_KEY is not set in the environment for Solana.' };
            }
            const heliusRpcUrl = `https://rpc.helius.xyz/?api-key=${HELIUS_API_KEY}`;
            const solanaConnection = new Connection(heliusRpcUrl);
            try {
                const publicKey = new PublicKey(walletAddress);
                const balanceLamports = await solanaConnection.getBalance(publicKey);
                const balance = balanceLamports / 1_000_000_000; // Convert lamports to SOL
                return { blockchain, balance: balance.toString() };
            } catch (error: any) {
                return { error: `Error fetching Solana balance via Helius: ${error.message}` };
            }
        } else {
            return { error: 'Could not identify wallet as ETH or Solana.' };
        }
    } catch (error: any) {
        return { error: `An unexpected error occurred: ${error.message}` };
    }
}