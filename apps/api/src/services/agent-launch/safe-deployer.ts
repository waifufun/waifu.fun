import { createRequire } from "node:module";
import {
	http,
	type Address,
	type Hex,
	type PublicClient,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	getAddress,
	isAddress,
	keccak256,
	parseAbi,
	stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";
import {
	AGENT_ROLE_ID,
	type AgentAutonomyConfig,
	type AgentLaunchChain,
	DEFAULT_AGENT_AUTONOMY,
	PATRON_ROLE_ID,
	buildAgentRoleConfigCalls,
	buildPatronRoleConfigCalls,
	concatenateRoleCalls,
} from "./safe-config.js";

const require = createRequire(import.meta.url);

export interface DeployAgentSafeParams {
	agentId: string;
	chain: AgentLaunchChain;
	patronAddresses: Address[];
	agentEoaAddress: Address;
	agentTokenAddress?: Address;
	autonomy?: AgentAutonomyConfig;
}

export interface DeployAgentSafeResult {
	safeAddress: Address;
	modifierAddress: Address;
	agentRoleId: Hex;
	patronRoleId: Hex;
}

interface DeployAgentSafeDeps {
	deploySafe?: (params: {
		owners: Address[];
		threshold: number;
		saltNonce: string;
	}) => Promise<Address>;
	deployRolesModifier?: (params: { safeAddress: Address; saltNonce: string }) => Promise<Address>;
	enableModule?: (params: { safeAddress: Address; modifierAddress: Address }) => Promise<void>;
	submitRoleCalls?: (params: {
		modifierAddress: Address;
		calls: Hex[];
		data: Hex;
	}) => Promise<void>;
	walletClient?: WalletClient;
	publicClient?: PublicClient;
}

const ROLES_FACTORY_ABI = parseAbi([
	"function deployModule(address owner, address avatar, address target, bytes data, uint256 saltNonce) returns (address module)",
]);

const SAFE_MODULE_ABI = parseAbi(["function enableModule(address module)"]);

export async function deployAgentSafe(
	params: DeployAgentSafeParams,
	deps: DeployAgentSafeDeps = {},
): Promise<DeployAgentSafeResult> {
	if (params.chain !== "bsc") {
		throw new Error(`Safe + Zodiac deployment is only implemented for bsc; received ${params.chain}`);
	}
	const patronAddresses = normalizePatrons(params.patronAddresses);
	const agentEoaAddress = getAddress(params.agentEoaAddress);
	const owners = [...new Set(patronAddresses)];
	const threshold = calculateSafeThreshold(owners.length);
	const saltNonce = saltForAgent(params.agentId, params.chain);

	const safeAddress = deps.deploySafe
		? await deps.deploySafe({ owners, threshold, saltNonce })
		: await deploySafeWithProtocolKit({ owners, threshold, saltNonce });

	const modifierAddress = deps.deployRolesModifier
		? await deps.deployRolesModifier({ safeAddress, saltNonce })
		: await deployRolesModifier({
				safeAddress,
				saltNonce,
				...(deps.walletClient ? { walletClient: deps.walletClient } : {}),
			});

	if (deps.enableModule) {
		await deps.enableModule({ safeAddress, modifierAddress });
	} else {
		await enableRolesModifierOnSafe({
			safeAddress,
			modifierAddress,
			...(deps.walletClient ? { walletClient: deps.walletClient } : {}),
		});
	}

	const calls = [
		...buildAgentRoleConfigCalls(params.autonomy ?? DEFAULT_AGENT_AUTONOMY, agentEoaAddress, params.agentTokenAddress),
		...buildPatronRoleConfigCalls(patronAddresses),
	];
	const data = concatenateRoleCalls(calls);

	if (deps.submitRoleCalls) {
		await deps.submitRoleCalls({ modifierAddress, calls, data });
	} else {
		await submitRoleCalls({
			modifierAddress,
			data,
			...(deps.walletClient ? { walletClient: deps.walletClient } : {}),
		});
	}

	return {
		safeAddress,
		modifierAddress,
		agentRoleId: AGENT_ROLE_ID,
		patronRoleId: PATRON_ROLE_ID,
	};
}

export function calculateSafeThreshold(ownerCount: number): number {
	if (!Number.isInteger(ownerCount) || ownerCount <= 0) {
		throw new Error("at least one patron owner is required");
	}
	if (ownerCount === 1) return 1;
	return Math.floor(ownerCount / 2) + 1;
}

async function deploySafeWithProtocolKit(params: {
	owners: Address[];
	threshold: number;
	saltNonce: string;
}): Promise<Address> {
	const { default: Safe } = (await import("@safe-global/protocol-kit")) as unknown as {
		default: {
			init(args: unknown): Promise<{
				deploySafe(args?: unknown): Promise<unknown>;
				getAddress(): Promise<string>;
			}>;
		};
	};
	loadZodiacPackage();
	const signer = getDeploymentPrivateKey();
	const rpcUrl = getRpcUrl();
	const protocolKit = await Safe.init({
		provider: rpcUrl,
		signer,
		predictedSafe: {
			safeAccountConfig: {
				owners: params.owners,
				threshold: params.threshold,
			},
			safeDeploymentConfig: {
				saltNonce: params.saltNonce,
			},
		},
	});
	await protocolKit.deploySafe();
	return getAddress(await protocolKit.getAddress());
}

async function deployRolesModifier(params: {
	safeAddress: Address;
	saltNonce: string;
	walletClient?: WalletClient;
}): Promise<Address> {
	const factoryAddress = readAddressEnv("ZODIAC_ROLES_FACTORY_ADDRESS");
	if (!factoryAddress) {
		throw new Error(
			"ZODIAC_ROLES_FACTORY_ADDRESS is required to deploy Roles modifier until Zodiac deployment metadata is wired",
		);
	}
	const walletClient = params.walletClient ?? createDefaultWalletClient();
	const account = walletClient.account;
	if (!account) throw new Error("wallet client account is required to deploy Roles modifier");
	const hash = await walletClient.writeContract({
		account,
		address: factoryAddress,
		abi: ROLES_FACTORY_ABI,
		functionName: "deployModule",
		args: [account.address, params.safeAddress, params.safeAddress, "0x", BigInt(params.saltNonce)],
		chain: bsc,
	});
	const publicClient = createDefaultPublicClient();
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	const createdAddress = receipt.contractAddress ?? receipt.logs[0]?.address;
	if (!createdAddress) throw new Error(`Roles modifier address not found in ${hash}`);
	return getAddress(createdAddress);
}

async function enableRolesModifierOnSafe(params: {
	safeAddress: Address;
	modifierAddress: Address;
	walletClient?: WalletClient;
}): Promise<void> {
	const walletClient = params.walletClient ?? createDefaultWalletClient();
	const account = walletClient.account;
	if (!account) throw new Error("wallet client account is required to enable Roles modifier");
	await walletClient.writeContract({
		account,
		address: params.safeAddress,
		abi: SAFE_MODULE_ABI,
		functionName: "enableModule",
		args: [params.modifierAddress],
		chain: bsc,
	});
}

async function submitRoleCalls(params: {
	modifierAddress: Address;
	data: Hex;
	walletClient?: WalletClient;
}): Promise<void> {
	if (params.data === "0x") return;
	const walletClient = params.walletClient ?? createDefaultWalletClient();
	const account = walletClient.account;
	if (!account) throw new Error("wallet client account is required to configure Roles modifier");
	await walletClient.sendTransaction({
		account,
		to: params.modifierAddress,
		data: params.data,
		value: 0n,
		chain: bsc,
	});
}

function loadZodiacPackage(): void {
	// @gnosis.pm/zodiac ships a CommonJS entry that exposes factory helpers. Its
	// ESM entry currently uses directory imports that NodeNext rejects, so load it
	// through createRequire while still keeping it as the Zodiac deployment package
	// this service is built around.
	require("@gnosis.pm/zodiac");
}

function normalizePatrons(patronAddresses: Address[]): Address[] {
	if (patronAddresses.length === 0) throw new Error("at least one patron owner is required");
	return patronAddresses.map((address) => {
		if (!isAddress(address)) throw new Error(`invalid patron address: ${address}`);
		return getAddress(address);
	});
}

function saltForAgent(agentId: string, chain: AgentLaunchChain): string {
	return BigInt(keccak256(stringToHex(`${chain}:${agentId}`))).toString();
}

function getDeploymentPrivateKey(): Hex {
	const privateKey = process.env.SAFE_DEPLOYMENT_FUNDER_PK;
	if (!privateKey) throw new Error("SAFE_DEPLOYMENT_FUNDER_PK is required to deploy agent Safe");
	return privateKey.startsWith("0x") ? (privateKey as Hex) : (`0x${privateKey}` as Hex);
}

function getRpcUrl(): string {
	const rpcUrl = process.env.BSC_RPC_URL ?? process.env.RPC_URL;
	if (!rpcUrl) throw new Error("BSC_RPC_URL or RPC_URL is required to deploy agent Safe");
	return rpcUrl;
}

function createDefaultWalletClient(): WalletClient {
	const account = privateKeyToAccount(getDeploymentPrivateKey());
	return createWalletClient({ account, chain: bsc, transport: http(getRpcUrl()) });
}

function createDefaultPublicClient(): PublicClient {
	return createPublicClient({ chain: bsc, transport: http(getRpcUrl()) });
}

function readAddressEnv(name: string): Address | null {
	const value = process.env[name];
	if (!value) return null;
	return getAddress(value);
}
