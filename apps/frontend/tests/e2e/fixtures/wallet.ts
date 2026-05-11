/**
 * Mock window.ethereum provider injected before page load.
 *
 * Implements just enough of EIP-1193 + EIP-6963 to satisfy wagmi's
 * `injected` connector. We deliberately avoid simulating MetaMask
 * branding because RainbowKit's metaMaskWallet falls back to a
 * WalletConnect path on desktop when the extension isn't detected,
 * and we don't want to spin up a real WC bridge for tests.
 *
 * The injected connector is sufficient for our e2e needs: it goes
 * through the same wagmi connect → useAccount → SIWE-sign code path
 * as a real wallet.
 *
 * Usage:
 *   await injectWallet(page, { address: TEST_ADDRESS });
 *   await page.goto("/create/wizard");
 *   // The "Browser Wallet" row appears in the connect modal.
 */
import type { BrowserContext, Page } from "@playwright/test";

export const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";
export const BSC_CHAIN_ID = "0x38"; // 56

export type MockWalletOptions = {
	address?: string;
	chainId?: string;
	/** When true, every signing request rejects with a user-rejection error. */
	rejectSign?: boolean;
};

const INIT_SCRIPT = (opts: Required<MockWalletOptions>) => `
(() => {
	const ADDRESS = ${JSON.stringify(opts.address)};
	const CHAIN_ID = ${JSON.stringify(opts.chainId)};
	const REJECT_SIGN = ${JSON.stringify(opts.rejectSign)};

	const listeners = new Map();
	let isConnected = false;
	let currentChain = CHAIN_ID;

	function emit(event, payload) {
		const set = listeners.get(event);
		if (!set) return;
		for (const cb of set) {
			try { cb(payload); } catch { /* ignore */ }
		}
	}

	const provider = {
		isMetaMask: true,
		isMockWaifu: true,
		_metamask: { isUnlocked: async () => true },
		chainId: CHAIN_ID,
		networkVersion: String(parseInt(CHAIN_ID, 16)),
		selectedAddress: null,
		on(event, cb) {
			let set = listeners.get(event);
			if (!set) { set = new Set(); listeners.set(event, set); }
			set.add(cb);
		},
		removeListener(event, cb) {
			const set = listeners.get(event);
			if (set) set.delete(cb);
		},
		removeAllListeners() { listeners.clear(); },
		async enable() { return this.request({ method: "eth_requestAccounts" }); },
		async request({ method, params }) {
			switch (method) {
				case "eth_requestAccounts":
				case "eth_accounts": {
					if (method === "eth_accounts" && !isConnected) return [];
					if (!isConnected) {
						isConnected = true;
						provider.selectedAddress = ADDRESS;
						queueMicrotask(() => emit("accountsChanged", [ADDRESS]));
						queueMicrotask(() => emit("connect", { chainId: currentChain }));
					}
					return [ADDRESS];
				}
				case "eth_chainId":
					return currentChain;
				case "net_version":
					return String(parseInt(currentChain, 16));
				case "wallet_switchEthereumChain": {
					const next = params?.[0]?.chainId;
					if (typeof next === "string") {
						currentChain = next;
						provider.chainId = next;
						emit("chainChanged", next);
					}
					return null;
				}
				case "wallet_addEthereumChain":
					return null;
				case "personal_sign":
				case "eth_sign":
				case "eth_signTypedData":
				case "eth_signTypedData_v4": {
					if (REJECT_SIGN) {
						const err = new Error("User rejected request");
						err.code = 4001;
						throw err;
					}
					// Deterministic fake signature. 65 bytes hex.
					return "0x" + "ab".repeat(64) + "1c";
				}
				case "eth_sendTransaction":
				case "eth_sendRawTransaction": {
					// Deterministic fake tx hash. Tests should NOT depend on this
					// because we mock the backend; this is just so wagmi doesn't
					// blow up if a code path slips through.
					return "0x" + "cd".repeat(32);
				}
				case "eth_getBalance":
					return "0xde0b6b3a7640000"; // 1 ETH in wei
				case "eth_blockNumber":
					return "0x1";
				case "eth_call":
					return "0x";
				case "eth_estimateGas":
					return "0x5208";
				case "eth_gasPrice":
					return "0x3b9aca00";
				default:
					// wagmi probes a bunch of methods. Return null instead of
					// throwing so the connector doesn't bail out.
					return null;
			}
		},
	};

	Object.defineProperty(window, "ethereum", {
		value: provider,
		writable: false,
		configurable: false,
	});

	// EIP-6963 announce. RainbowKit + wagmi listen for these to discover
	// injected wallets without racing on \`window.ethereum\` write.
	const info = {
		uuid: "11111111-1111-1111-1111-111111111111",
		name: "Mock Wallet",
		icon: "data:image/svg+xml;base64,PHN2Zy8+",
		rdns: "fun.waifu.mockwallet",
	};
	const announce = () => {
		window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
			detail: Object.freeze({ info, provider }),
		}));
	};
	window.addEventListener("eip6963:requestProvider", announce);
	announce();
})();
`;

export async function injectWallet(target: Page | BrowserContext, opts: MockWalletOptions = {}): Promise<void> {
	const resolved: Required<MockWalletOptions> = {
		address: opts.address ?? TEST_ADDRESS,
		chainId: opts.chainId ?? BSC_CHAIN_ID,
		rejectSign: opts.rejectSign ?? false,
	};
	await target.addInitScript(INIT_SCRIPT(resolved));
}

// Auth cookie helpers live in `./auth.ts` to keep this file focused on
// EIP-1193 / EIP-6963 wallet injection.
