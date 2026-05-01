/**
 * Agent launch service — barrel file.
 *
 * See orchestrator.ts for the end-to-end flow and types.ts for the input
 * surface. Callers should typically only import `AgentLaunchOrchestrator`
 * (or `createOrchestrator`) and the input/result types.
 */

export {
	AgentLaunchOrchestrator,
	createOrchestrator,
	type OrchestratorDeps,
	type PersonaStore,
	type AgentLaunchPrepareResult,
	type AgentLaunchBroadcastInput,
} from "./orchestrator.js";
export type {
	AgentLaunchInput,
	AgentLaunchResult,
	AgentPersonaConfig,
	FourMemeLabel,
	FourMemeTaxConfig,
	StewardAgentWallet,
} from "./types.js";
export { AgentLaunchError, FourMemeError } from "./errors.js";
export {
	StewardClient,
	StewardError,
	createStewardClient,
	type StewardConfig,
} from "./steward.js";
export { fourMemeLogin, FOURMEME_API_BASE } from "./fourmeme-auth.js";
export { fourMemeUploadImage } from "./fourmeme-upload.js";
export {
	fourMemeCreateToken,
	defaultAgentTaxConfig,
} from "./fourmeme-create.js";
export {
	deployAgentSafe,
	calculateSafeThreshold,
	type DeployAgentSafeParams,
	type DeployAgentSafeResult,
} from "./safe-deployer.js";
export {
	DEFAULT_AGENT_AUTONOMY,
	WHITELISTED_TARGETS,
	AGENT_ROLE_ID,
	PATRON_ROLE_ID,
	buildAgentRoleScopes,
	type AgentAutonomyConfig,
	type AgentLaunchChain,
	type RoleScope,
} from "./safe-config.js";
export {
	updateAgentAutonomy,
	type UnsignedTx,
	type UpdateAgentAutonomyConfig,
} from "./safe-role-updater.js";
export {
	DEFAULT_EIP8004_NFT_ADDRESS,
	EIP8004_REGISTRATION_TYPE,
	EIP8004_ABI,
	buildAgentURI,
	encodeRegisterCalldata,
	registerAgentIdentity,
	type Eip8004Signer,
	type RegisterAgentIdentityOpts,
	type RegisterAgentIdentityResult,
	type Eip8004RegistrationPayload,
} from "./fourmeme-8004-register.js";
