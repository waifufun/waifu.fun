/**
 * Address of the architect agent (Sol).
 *
 * Until $WAIFU mints, the canonical agent page for `/agent/sol` points at
 * the ElizaOS placeholder token on BSC (per Shadow's sprint 2 decision).
 * When the real token launches, swap this constant for that address and
 * both the `/agent/sol` vanity slug and any Sol-specific logic update in
 * one place.
 */
export const SOL_AGENT_ADDRESS = "0xea17df5cf6d172224892b5477a16acb111182478";

export function isSolAgentAddress(address: string): boolean {
	return address.toLowerCase() === SOL_AGENT_ADDRESS.toLowerCase();
}
