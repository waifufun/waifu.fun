import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "waifufun-local-contract-tests-"));
const solanaLedgerDir = path.join(tempRoot, "solana-ledger");
const solanaWalletPath = path.join(tempRoot, "anchor-wallet.json");
const solanaAuditDir = path.join(rootDir, "packages", "contracts-solana", "autofun-sc-audit");
const solanaProgramLibPath = path.join(solanaAuditDir, "programs", "autofun", "src", "lib.rs");
const solanaProgramIdlPath = path.join(solanaAuditDir, "target", "idl", "autofun.json");
const solanaProgramKeypairPath = path.join(solanaAuditDir, "target", "deploy", "autofun-keypair.json");

const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

const childProcesses = [];
const fileRestores = [];
async function getFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Unable to resolve a free TCP port"));
				return;
			}

			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(port);
			});
		});
		server.on("error", reject);
	});
}

function formatCommand(command, args) {
	return [command, ...args].join(" ");
}

function buildEnv(overrides = {}) {
	return {
		...process.env,
		...overrides,
	};
}

async function runCommand(command, args, options = {}) {
	const { cwd = rootDir, env = {} } = options;

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: buildEnv(env),
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}

			const error = new Error(`Command failed (${code}): ${formatCommand(command, args)}`);
			error.stdout = stdout;
			error.stderr = stderr;
			reject(error);
		});
	});
}

function startProcess(name, command, args, options = {}) {
	const { cwd = rootDir, env = {} } = options;

	const child = spawn(command, args, {
		cwd,
		env: buildEnv(env),
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
	});

	child.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	childProcesses.push({ name, child, getLogs: () => `${stdout}${stderr}`.trim() });
	return child;
}

async function stopProcess(record) {
	const { child } = record;
	if (!child || child.exitCode !== null) {
		return;
	}

	child.stdout?.destroy();
	child.stderr?.destroy();

	child.kill("SIGKILL");

	const exited = once(child, "exit").catch(() => undefined);
	const timeout = new Promise((resolve) => setTimeout(resolve, 1_000));
	await Promise.race([exited, timeout]);

	if (child.exitCode === null && child.pid) {
		try {
			process.kill(child.pid, "SIGKILL");
		} catch (error) {
			// Ignore stale pids.
		}
	}
}

async function cleanup() {
	while (childProcesses.length > 0) {
		const record = childProcesses.pop();
		await stopProcess(record);
	}

	while (fileRestores.length > 0) {
		const restore = fileRestores.pop();
		await restore();
	}

	await rm(tempRoot, { recursive: true, force: true });
}

async function waitForJsonRpc(url, method, params = [], timeoutMs = 180_000) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method,
					params,
				}),
			});
			const payload = await response.json();

			if (!payload.error) {
				return payload.result;
			}
		} catch (error) {
			// Keep polling until timeout.
		}

		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}

	throw new Error(`Timed out waiting for ${method} at ${url}`);
}

async function waitForTcpPort(host, port, timeoutMs = 180_000) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			await new Promise((resolve, reject) => {
				const socket = net.createConnection({ host, port }, () => {
					socket.end();
					resolve();
				});

				socket.on("error", reject);
			});
			return;
		} catch (error) {
			// Keep polling until timeout.
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(`Timed out waiting for TCP ${host}:${port}`);
}

async function fundSolanaWallet(walletPath, rpcUrl, maxAttempts = 10) {
	let lastError;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await runCommand("solana", ["airdrop", "100", walletPath, "--url", rpcUrl]);
			return;
		} catch (error) {
			lastError = error;

			if (attempt === maxAttempts) {
				throw lastError;
			}

			await new Promise((resolve) => setTimeout(resolve, 1_000));
		}
	}
}

function extractJsonLine(stdout) {
	const line = stdout
		.trim()
		.split("\n")
		.map((entry) => entry.trim())
		.reverse()
		.find((entry) => entry.startsWith("{") && entry.endsWith("}"));

	if (!line) {
		throw new Error("Deployment JSON was not found in command output");
	}

	return JSON.parse(line);
}

function extractSingleLine(stdout) {
	const line = stdout
		.trim()
		.split("\n")
		.map((entry) => entry.trim())
		.reverse()
		.find(Boolean);

	if (!line) {
		throw new Error("Expected command output but received none");
	}

	return line;
}

function replaceDeclaredProgramId(source, programId) {
	return source.replace(/declare_id!\("([^"]+)"\);/, `declare_id!("${programId}");`);
}

async function getCanonicalProgramId() {
	const idl = JSON.parse(await readFile(solanaProgramIdlPath, "utf8"));
	return idl.address;
}

async function rewriteDeclaredProgramId(programId, canonicalProgramId) {
	const originalSource = await readFile(solanaProgramLibPath, "utf8");
	const currentProgramId = originalSource.match(/declare_id!\("([^"]+)"\);/)?.[1];

	if (!currentProgramId) {
		throw new Error("Unable to locate declared Solana program id");
	}

	if (currentProgramId === programId) {
		if (currentProgramId !== canonicalProgramId) {
			fileRestores.push(() =>
				writeFile(solanaProgramLibPath, replaceDeclaredProgramId(originalSource, canonicalProgramId)),
			);
		}
		return;
	}

	const updatedSource = replaceDeclaredProgramId(originalSource, programId);
	if (updatedSource === originalSource) {
		throw new Error("Unable to rewrite declared Solana program id");
	}

	await writeFile(solanaProgramLibPath, updatedSource);
	fileRestores.push(() =>
		writeFile(solanaProgramLibPath, replaceDeclaredProgramId(originalSource, canonicalProgramId)),
	);
}

process.on("SIGINT", async () => {
	await cleanup();
	process.exit(130);
});

process.on("SIGTERM", async () => {
	await cleanup();
	process.exit(143);
});

try {
	const evmPort = await getFreePort();
	const solanaRpcPort = await getFreePort();
	let solanaFaucetPort = await getFreePort();
	while (solanaFaucetPort === solanaRpcPort + 1) {
		solanaFaucetPort = await getFreePort();
	}
	const EVM_RPC_URL = `http://127.0.0.1:${evmPort}`;
	const SOLANA_RPC_URL = `http://127.0.0.1:${solanaRpcPort}`;
	const solanaEnv = {
		ANCHOR_PROVIDER_URL: SOLANA_RPC_URL,
		ANCHOR_WALLET: solanaWalletPath,
		INIT_BONDING_CURVE: process.env.INIT_BONDING_CURVE || "30",
		DECIMALS: process.env.DECIMALS || "6",
		TOKEN_SUPPLY: process.env.TOKEN_SUPPLY || "1000000000000000",
		VIRTUAL_RESERVES: process.env.VIRTUAL_RESERVES || "2800000000",
	};
	const evmEnv = {
		ETH_RPC: EVM_RPC_URL,
	};

	console.log("Creating Solana test wallet");
	await runCommand("solana-keygen", ["new", "--no-passphrase", "--silent", "--force", "--outfile", solanaWalletPath]);

	console.log("Starting local EVM network");
	startProcess("anvil", "anvil", ["--host", "127.0.0.1", "--port", String(evmPort), "--chain-id", "31337"]);

	console.log("Starting local Solana validator");
	startProcess("solana-test-validator", "solana-test-validator", [
		"--reset",
		"--quiet",
		"--ledger",
		solanaLedgerDir,
		"--rpc-port",
		String(solanaRpcPort),
		"--faucet-port",
		String(solanaFaucetPort),
		"--bind-address",
		"127.0.0.1",
		"--url",
		"https://api.mainnet-beta.solana.com",
		"--clone-upgradeable-program",
		METADATA_PROGRAM_ID,
	]);

	await waitForJsonRpc(EVM_RPC_URL, "eth_chainId");
	await waitForTcpPort("127.0.0.1", solanaRpcPort);
	await waitForTcpPort("127.0.0.1", solanaFaucetPort);
	await waitForJsonRpc(SOLANA_RPC_URL, "getLatestBlockhash");

	console.log("Funding Solana deployer wallet");
	await fundSolanaWallet(solanaWalletPath, SOLANA_RPC_URL);
	const canonicalSolanaProgramId = await getCanonicalProgramId();
	const localSolanaProgramId = extractSingleLine(
		(
			await runCommand("solana", ["address", "-k", solanaProgramKeypairPath], {
				cwd: solanaAuditDir,
				env: solanaEnv,
			})
		).stdout,
	);
	await rewriteDeclaredProgramId(localSolanaProgramId, canonicalSolanaProgramId);

	console.log("Compiling EVM contracts");
	await runCommand("bun", ["run", "--filter", "@waifufun/contracts-evm", "compile"], {
		env: evmEnv,
	});

	console.log("Deploying EVM contracts to anvil");
	const evmDeploy = await runCommand("bun", ["run", "--filter", "@waifufun/contracts-evm", "deploy:local"], {
		env: {
			...evmEnv,
			PRINT_JSON: "1",
		},
	});
	const evmDeployment = extractJsonLine(evmDeploy.stdout);
	const evmTestEnv = {
		...evmEnv,
		WAIFUFUN_DEPLOYMENT: JSON.stringify(evmDeployment),
	};

	console.log("Building Solana program");
	await runCommand("bun", ["run", "--filter", "@waifufun/contracts-solana-audit", "build:local"], {
		env: solanaEnv,
	});

	console.log("Deploying Solana program to local validator");
	await runCommand(
		"solana",
		[
			"program",
			"deploy",
			"target/deploy/autofun.so",
			"--program-id",
			"target/deploy/autofun-keypair.json",
			"--url",
			SOLANA_RPC_URL,
			"--keypair",
			solanaWalletPath,
		],
		{
			cwd: solanaAuditDir,
			env: solanaEnv,
		},
	);
	const solanaProgramAddress = extractSingleLine(
		(
			await runCommand("solana", ["address", "-k", solanaProgramKeypairPath], {
				cwd: solanaAuditDir,
				env: solanaEnv,
			})
		).stdout,
	);
	const solanaTestEnv = {
		...solanaEnv,
		SOLANA_PROGRAM_ID: solanaProgramAddress,
	};

	console.log("Running EVM contract tests");
	await runCommand("bun", ["run", "--filter", "@waifufun/contracts-evm", "test:local"], {
		env: evmTestEnv,
	});

	console.log("Running Solana contract tests");
	await runCommand("bun", ["run", "--filter", "@waifufun/contracts-solana-audit", "test:contracts"], {
		env: solanaTestEnv,
	});

	console.log("Running Solana end-to-end tests");
	await runCommand("bun", ["run", "--filter", "@waifufun/contracts-solana-audit", "test:e2e"], {
		env: solanaTestEnv,
	});

	console.log("Local contract test pipeline passed");
} catch (error) {
	console.error(error.message);
	if (error.stdout) {
		console.error(error.stdout.trim());
	}
	if (error.stderr) {
		console.error(error.stderr.trim());
	}

	for (const record of childProcesses) {
		const logs = record.getLogs();
		if (logs) {
			console.error(`\n[${record.name} logs]\n${logs}`);
		}
	}

	process.exitCode = 1;
} finally {
	await cleanup();
}
