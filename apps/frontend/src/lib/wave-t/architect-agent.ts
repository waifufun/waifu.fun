/**
 * Address of the architect agent.
 *
 * The constant is named after the role (the architect that builds the
 * waifu.fun platform itself), not the persona that currently fills it.
 * Sol is the first architect and $WAIFU is the first architect token; if
 * the persona changes or the platform onboards a second architect-tier
 * agent, the role survives the rename.
 *
 * Until $WAIFU mints, the canonical agent page for `/agent/sol` points at
 * an ElizaOS placeholder token on BSC. When the real token launches, swap
 * this constant and both the `/agent/sol` vanity slug and any architect-
 * specific logic update in one place.
 */
export const ARCHITECT_AGENT_ADDRESS = "0xea17df5cf6d172224892b5477a16acb111182478";

export function isArchitectAgentAddress(address: string): boolean {
	return address.toLowerCase() === ARCHITECT_AGENT_ADDRESS.toLowerCase();
}
