// Flap Portal rate-limit characterization probe.

const fs = require("fs");
const path = require("path");
const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x29e6383f0ce68507B5A72a53c2B118a118332Aa8";
const ZERO = ethers.ZeroAddress;
const RATE_LIMIT_SELECTOR = "0xa7382e9b";

// Brief-supplied keys (we'll see they already have rate-limit state on mainnet).
const SIGNER_A_PK = "0xc20247741796fbb27e261bf3f2bf696906f987c19a19a381ee013ab84c241a85";
const SIGNER_B_PK = "0xa0da56c001d849ca94217a3450403bbf097a694cccadb578196d2dd18c69f9c6";
// Fresh ganache-default keys with no on-chain history at fork block.
const SIGNER_C_PK = "0x3967a8c4ebf6cc11594e2d28d2f92ee8b1a33c6b3e5d24a6b8ed38417ecd3139";
const SIGNER_D_PK = "0x53b3259c3826dc0f9d2ae77864ce28f367de59fc2ca23864e9bd39a0884546ed";
const SIGNER_E_PK = "0xeacfe6acf19fd487ac757b99a863895bb9eba3a8a2f63d0d772802cc0762f81d";

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

function cloneInitCode(impl) {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
function predict(salt) {
  return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL)));
}
function mineSalt(label) {
  let salt = ethers.keccak256(ethers.toUtf8Bytes(`cd ${label} ${Date.now()} ${Math.random()}`));
  let i = 0;
  while (!predict(salt).toLowerCase().endsWith("7777")) {
    salt = ethers.keccak256(salt);
    i++;
  }
  return { salt, predicted: predict(salt), i };
}

const PORTAL_ABI = [
  "function newTokenV2((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint16 tax,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData) params) payable returns (address)",
  "function version() view returns (string)",
];

const wrapperArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, "MinimalWrapper.json"), "utf8"));

function makeParams(label, beneficiary, quoteAmt) {
  const { salt } = mineSalt(label);
  return {
    name: `T${label}`.slice(0, 12),
    symbol: `T${label}`.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8),
    meta: "QmCooldownProbe",
    dexThresh: 1,
    salt,
    tax: 1000,
    migratorType: 1,
    quoteToken: ZERO,
    quoteAmt,
    beneficiary,
    permitData: "0x",
  };
}

function decodeRateLimit(hexData) {
  if (!hexData || typeof hexData !== "string" || !hexData.startsWith(RATE_LIMIT_SELECTOR)) return null;
  try {
    const body = "0x" + hexData.slice(2 + 8);
    const [user, unlockTime] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], body);
    return { user, unlockTime };
  } catch {
    return null;
  }
}

function safeDecoded(d) {
  if (!d) return null;
  return { user: d.user, unlockTime: d.unlockTime.toString() };
}

async function callAndDecode(contract, method, args, value, fromSigner) {
  try {
    const tx = await contract.connect(fromSigner)[method](...args, { value, gasLimit: 5_000_000 });
    const r = await tx.wait();
    return { ok: true, gasUsed: r.gasUsed, txHash: r.hash };
  } catch (err) {
    let rawData = null;
    try {
      const iface = new ethers.Interface(contract.interface.fragments);
      const calldata = iface.encodeFunctionData(method, args);
      const target = await contract.getAddress();
      await provider.call({ to: target, from: await fromSigner.getAddress(), data: calldata, value });
    } catch (cErr) {
      rawData = cErr.data || cErr.info?.error?.data || cErr.error?.data || null;
      if (rawData && typeof rawData === "object" && rawData.data) rawData = rawData.data;
    }
    const decoded = decodeRateLimit(rawData);
    return { ok: false, rawData, decoded, shortMessage: err.shortMessage || (err.message || "").slice(0, 200) };
  }
}

async function setNextBlockTimestamp(ts) {
  await provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
  await provider.send("evm_mine", []);
}
async function getBlockInfo(tag = "latest") {
  const blk = await provider.getBlock(tag);
  return { number: blk.number, timestamp: blk.timestamp };
}
async function setBalance(addr, bnb = 1000) {
  const wei = "0x" + (BigInt(bnb) * 10n ** 18n).toString(16);
  try { await provider.send("evm_setAccountBalance", [addr, wei]); } catch {}
}

const SUMMARY = {};

function log(label, data) {
  console.log(`\n[${label}]`, JSON.stringify(data, (_, v) => typeof v === "bigint" ? v.toString() : v));
  SUMMARY[label] = data;
}

async function main() {
  const findings = { startedAt: new Date().toISOString() };

  function wrap(pk) {
    const w = new ethers.Wallet(pk, provider);
    const nm = new ethers.NonceManager(w);
    nm.address = w.address;
    return nm;
  }
  const wallets = {
    A: wrap(SIGNER_A_PK),
    B: wrap(SIGNER_B_PK),
    C: wrap(SIGNER_C_PK), // fresh ganache acct
    D: wrap(SIGNER_D_PK), // fresh ganache acct
    E: wrap(SIGNER_E_PK), // fresh ganache acct
  };
  for (const k of Object.keys(wallets)) await setBalance(wallets[k].address);

  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, wallets.A);
  console.log(`portal version=${await portal.version()}`);
  for (const k of Object.keys(wallets)) console.log(`signer${k}=${wallets[k].address}`);

  let blk = await getBlockInfo();
  console.log(`fork block=${blk.number} ts=${blk.timestamp} (${new Date(blk.timestamp*1000).toISOString()})`);
  findings.fork = blk;

  // ======================================================================
  // Step 1: virgin EOA_C calls Portal directly. Should succeed.
  // ======================================================================
  console.log("\n=== Step 1: virgin EOA_C newTokenV2 #1 ===");
  const p1 = makeParams("C1", wallets.C.address, ethers.parseEther("0.01"));
  const r1 = await callAndDecode(portal, "newTokenV2", [p1], ethers.parseEther("0.01"), wallets.C);
  log("step1_eoaC_first", { ok: r1.ok, gasUsed: r1.gasUsed?.toString(), short: r1.shortMessage, decoded: safeDecoded(r1.decoded) });
  findings.step1 = SUMMARY.step1_eoaC_first;

  // ======================================================================
  // Step 2: EOA_C immediately retries. Expect rate-limit.
  // ======================================================================
  console.log("\n=== Step 2: EOA_C newTokenV2 #2 (expect rate-limit) ===");
  const p2 = makeParams("C2", wallets.C.address, ethers.parseEther("0.01"));
  const r2 = await callAndDecode(portal, "newTokenV2", [p2], ethers.parseEther("0.01"), wallets.C);
  log("step2_eoaC_second", { ok: r2.ok, short: r2.shortMessage, rawData: r2.rawData?.slice(0, 120), decoded: safeDecoded(r2.decoded) });

  let unlockTime = r2.decoded?.unlockTime;
  blk = await getBlockInfo();
  console.log(`after step2: block=${blk.number} ts=${blk.timestamp}`);
  if (unlockTime != null) {
    const dT = unlockTime - BigInt(blk.timestamp);
    const dN = unlockTime - BigInt(blk.number);
    findings.unlockTimeAnalysis = {
      unlockTime: unlockTime.toString(),
      unlockTimeHex: "0x" + unlockTime.toString(16),
      blockNumber: blk.number,
      blockTimestamp: blk.timestamp,
      deltaVsTimestamp_sec: dT.toString(),
      deltaVsBlockNumber: dN.toString(),
      unlockTimeAsUnixIso: new Date(Number(unlockTime) * 1000).toISOString(),
      blockTimestampAsIso: new Date(blk.timestamp * 1000).toISOString(),
    };
    console.log(JSON.stringify(findings.unlockTimeAnalysis, null, 2));
  }

  // ======================================================================
  // Step 3: caller dimension test using a wrapper.
  // signerD (virgin) deploys WrapperX, signerD → WrapperX.callV2 #1.
  // WrapperX is a virgin caller. signerD is also virgin.
  // ======================================================================
  console.log("\n=== Step 3: signerD deploys WrapperX, calls WrapperX.callV2 #1 ===");
  const factoryD = new ethers.ContractFactory(wrapperArtifact.abi, wrapperArtifact.bytecode, wallets.D);
  const wrapperX = await factoryD.deploy(PORTAL);
  await wrapperX.waitForDeployment();
  const wrapperXAddr = (await wrapperX.getAddress()).toLowerCase();
  console.log(`wrapperX=${wrapperXAddr}`);
  findings.wrapperX = wrapperXAddr;

  const p3 = makeParams("WX1", wrapperXAddr, ethers.parseEther("0.01"));
  const r3 = await callAndDecode(wrapperX, "callV2", [p3], ethers.parseEther("0.01"), wallets.D);
  log("step3_wrapperX_first", { ok: r3.ok, gasUsed: r3.gasUsed?.toString(), short: r3.shortMessage, decoded: safeDecoded(r3.decoded) });

  // ======================================================================
  // Step 4: same wrapperX, called by signerD AGAIN. Decode user to determine keying.
  // ======================================================================
  console.log("\n=== Step 4: signerD calls WrapperX.callV2 #2 (decode user) ===");
  const p4 = makeParams("WX2", wrapperXAddr, ethers.parseEther("0.01"));
  const r4 = await callAndDecode(wrapperX, "callV2", [p4], ethers.parseEther("0.01"), wallets.D);
  let callerKey = null;
  if (r4.decoded) {
    const u = r4.decoded.user.toLowerCase();
    if (u === wrapperXAddr) callerKey = "msg.sender";
    else if (u === wallets.D.address.toLowerCase()) callerKey = "tx.origin";
    else callerKey = `unknown(${u})`;
  }
  log("step4_wrapperX_second", { ok: r4.ok, short: r4.shortMessage, decoded: safeDecoded(r4.decoded), eoaD: wallets.D.address.toLowerCase(), wrapperX: wrapperXAddr, callerKey });
  findings.callerDimension = callerKey;

  // ======================================================================
  // Step 5: fresh WrapperY from signerD (still on cooldown if msg.sender keyed → Y succeeds; if tx.origin keyed → Y fails).
  // ======================================================================
  console.log("\n=== Step 5: signerD deploys WrapperY, calls WrapperY.callV2 #1 ===");
  const wrapperY = await factoryD.deploy(PORTAL);
  await wrapperY.waitForDeployment();
  const wrapperYAddr = (await wrapperY.getAddress()).toLowerCase();
  findings.wrapperY = wrapperYAddr;

  const p5 = makeParams("WY1", wrapperYAddr, ethers.parseEther("0.01"));
  const r5 = await callAndDecode(wrapperY, "callV2", [p5], ethers.parseEther("0.01"), wallets.D);
  log("step5_wrapperY_fresh", { ok: r5.ok, gasUsed: r5.gasUsed?.toString(), short: r5.shortMessage, decoded: safeDecoded(r5.decoded) });

  // ======================================================================
  // Step 6: corroborate. SignerE (also virgin) calls the SAME wrapperX as signerD did.
  // If msg.sender keyed: wrapperX should still be rate-limited (it has a cooldown), so reverts with user=wrapperX.
  // If tx.origin keyed: signerE has never created — should succeed (or revert with user=signerE if some other state).
  // ======================================================================
  console.log("\n=== Step 6: signerE calls wrapperX (which already created once) ===");
  const wrapperXAsE = wrapperX.connect(wallets.E);
  const p6 = makeParams("WX_E", wrapperXAddr, ethers.parseEther("0.01"));
  const r6 = await callAndDecode(wrapperXAsE, "callV2", [p6], ethers.parseEther("0.01"), wallets.E);
  log("step6_wrapperX_byE", { ok: r6.ok, gasUsed: r6.gasUsed?.toString(), short: r6.shortMessage, decoded: safeDecoded(r6.decoded), eoaE: wallets.E.address.toLowerCase() });

  // ======================================================================
  // Step 7: time travel. From step1 lockup on EOA_C: advance to unlockTime-1 (revert), then unlockTime (success).
  // Then measure the cooldown duration of the new success.
  // ======================================================================
  if (unlockTime != null) {
    console.log("\n=== Step 7: time-travel on EOA_C ===");
    await setNextBlockTimestamp(Number(unlockTime) - 1);
    blk = await getBlockInfo();
    console.log(`now ts=${blk.timestamp} (unlock-1=${Number(unlockTime)-1})`);
    const p7a = makeParams("C3", wallets.C.address, ethers.parseEther("0.01"));
    const r7a = await callAndDecode(portal, "newTokenV2", [p7a], ethers.parseEther("0.01"), wallets.C);
    log("step7a_unlock_minus_1", { ok: r7a.ok, short: r7a.shortMessage, decoded: safeDecoded(r7a.decoded), ts: blk.timestamp });

    await setNextBlockTimestamp(Number(unlockTime));
    blk = await getBlockInfo();
    console.log(`now ts=${blk.timestamp} (unlock=${unlockTime.toString()})`);
    const p7b = makeParams("C4", wallets.C.address, ethers.parseEther("0.01"));
    const r7b = await callAndDecode(portal, "newTokenV2", [p7b], ethers.parseEther("0.01"), wallets.C);
    log("step7b_unlock_exact", { ok: r7b.ok, gasUsed: r7b.gasUsed?.toString(), short: r7b.shortMessage, decoded: safeDecoded(r7b.decoded), ts: blk.timestamp });

    if (r7b.ok) {
      // Immediately probe rate-limit again to measure cooldown duration
      const p7c = makeParams("C5", wallets.C.address, ethers.parseEther("0.01"));
      const r7c = await callAndDecode(portal, "newTokenV2", [p7c], ethers.parseEther("0.01"), wallets.C);
      blk = await getBlockInfo();
      let dur = null;
      if (r7c.decoded) {
        dur = (r7c.decoded.unlockTime - BigInt(blk.timestamp)).toString();
      }
      log("step7c_immediate_retry", { ok: r7c.ok, decoded: safeDecoded(r7c.decoded), ts: blk.timestamp, cooldown_seconds: dur });
      findings.cooldown_seconds = dur;
    }
  }

  fs.writeFileSync(path.join(__dirname, "findings.json"), JSON.stringify({ ...findings, summary: SUMMARY }, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log("\n=== findings.json written ===");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
