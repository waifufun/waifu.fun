import {
	http,
	type Account,
	type Address,
	type Chain,
	type Hex,
	type PublicClient,
	type Transport,
	type WalletClient,
	createPublicClient,
	createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { AgentIdentifierAbi, TaxTokenAbi, TokenManager2Abi, TokenManagerHelper3Abi } from "./abis/index.js";
import { type FourMemeAddresses, type FourMemeNetworkKey, getFourMemeNetwork } from "./addresses.js";

export interface FourMemeClientConfig {
	chain: FourMemeNetworkKey;
	rpcUrl: string;
	/**
	 * Optional signer. When omitted the client is read-only and write helpers throw.
	 * Accepts a raw hex private key; callers needing other signer shapes should
	 * construct a `WalletClient` themselves and pass it via `walletClient`.
	 */
	privateKey?: Hex;
	/** Override the default mainnet/testnet address table (e.g. forks, upgrades). */
	addresses?: Partial<FourMemeAddresses>;
	/** Inject a preconfigured transport (defaults to `http(rpcUrl)`). */
	transport?: Transport;
	/** Inject a preconfigured wallet client. Takes precedence over `privateKey`. */
	walletClient?: WalletClient;
}

/**
 * Lightweight `(address, abi)` handle. We avoid `getContract(...)` here because
 * its inferred return type references non-portable internal abitype paths which
 * break `declaration: true` builds in this workspace.
 */
export interface ContractHandle<TAbi extends readonly unknown[]> {
	address: Address;
	abi: TAbi;
}

export interface FourMemeContracts {
	tokenManager2: ContractHandle<typeof TokenManager2Abi>;
	helper3: ContractHandle<typeof TokenManagerHelper3Abi>;
	agentIdentifier: ContractHandle<typeof AgentIdentifierAbi>;
}

export interface FourMemeClient {
	chain: Chain;
	chainKey: FourMemeNetworkKey;
	addresses: FourMemeAddresses;
	publicClient: PublicClient;
	walletClient?: WalletClient;
	account?: Account;
	contracts: FourMemeContracts;
	/** Build a TaxToken handle for a specific deployment address. */
	getTaxToken: (tokenAddress: Address) => ContractHandle<typeof TaxTokenAbi>;
}

export const createFourMemeClient = (config: FourMemeClientConfig): FourMemeClient => {
	const network = getFourMemeNetwork(config.chain);
	const addresses: FourMemeAddresses = { ...network.addresses, ...config.addresses };

	const transport = config.transport ?? http(config.rpcUrl);

	const publicClient = createPublicClient({
		chain: network.chain,
		transport,
	}) as PublicClient;

	let walletClient: WalletClient | undefined = config.walletClient;
	let account: Account | undefined = walletClient?.account;

	if (!walletClient && config.privateKey) {
		account = privateKeyToAccount(config.privateKey);
		walletClient = createWalletClient({
			account,
			chain: network.chain,
			transport,
		});
	}

	const contracts: FourMemeContracts = {
		tokenManager2: {
			address: addresses.tokenManager2,
			abi: TokenManager2Abi,
		},
		helper3: {
			address: addresses.tokenManagerHelper3,
			abi: TokenManagerHelper3Abi,
		},
		agentIdentifier: {
			address: addresses.agentIdentifier,
			abi: AgentIdentifierAbi,
		},
	};

	return {
		chain: network.chain,
		chainKey: network.key,
		addresses,
		publicClient,
		walletClient,
		account,
		contracts,
		getTaxToken: (tokenAddress: Address) => ({
			address: tokenAddress,
			abi: TaxTokenAbi,
		}),
	};
};

/**
 * Narrow a `FourMemeClient` to one that is guaranteed to have a wallet. Throws a
 * descriptive error if the client was constructed in read-only mode.
 */
export const requireWallet = (
	client: FourMemeClient,
): FourMemeClient & { walletClient: WalletClient; account: Account } => {
	if (!client.walletClient || !client.account) {
		throw new Error("FourMemeClient is read-only. Pass `privateKey` or `walletClient` to enable writes.");
	}
	return client as FourMemeClient & { walletClient: WalletClient; account: Account };
};
