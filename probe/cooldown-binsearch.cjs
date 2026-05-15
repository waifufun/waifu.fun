// Binary search the exact cooldown duration using evm_increaseTime.
// Each probe uses a fresh wallet so previous lockups don't contaminate.

const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");
const fs = require("fs");
const path = require("path");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x29e6383f0ce68507B5A72a53c2B118a118332Aa8";
const ZERO = ethers.ZeroAddress;
const RATE_LIMIT_SELECTOR = "0xa7382e9b";

const SEED_PKS = [
  "0x523f85f62765e98f2c74e0559cd94b522608f7b591e02c5b89a263da76104cba", // 4
  "0xb3ba5f220708a12c2d6b9acaf8a4150fc5d657279c1946de9748eb89042e7096", // 5
  "0x2be91e4fcb08cad94a715c9148c5613f04fc0dac58477ff19b93ffe5ae1dcba8", // 6
  "0x618ae2c987e67f7edcf6f87b347a26611a0a2395a2fc7f80508525e82a1de016", // 7
  "0x546bac09d20f55f9b71b1368b8c7e2480e0c1e6e2581babf85f857ad4302aa48", // 8
  "0x765df63431cc13e7baaa9e3d52ecc75f76b7c951119ed7c1d7f13e6034dec68f", // 9
];
// Generate more fresh wallets deterministically
function freshKey(seed) {
  return ethers.keccak256(ethers.toUtf8Bytes(`probe-eoa ${seed} ${Math.random()}`));
}

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

function cloneInitCode(impl) {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
function predict(salt) {
  return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL)));
}
function mineSalt(label) {
  let s = ethers.keccak256(ethers.toUtf8Bytes(`bs ${label} ${Date.now()} ${Math.random()}`));
  while (!predict(s).toLowerCase().endsWith("7777")) s = ethers.keccak256(s);
  return s;
}

const PORTAL_ABI = [
  "function newTokenV2((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint16 tax,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData) params) payable returns (address)",
];

function decode(hexData) {
  if (!hexData || !hexData.startsWith(RATE_LIMIT_SELECTOR)) return null;
  try {
    const [user, unlockTime] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], "0x" + hexData.slice(10));
    return { user, unlockTime };
  } catch { return null; }
}

function params(label, beneficiary, amount) {
  return {
    name: `T${label}`.slice(0, 12),
    symbol: `T${label}`.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8),
    meta: "QmBin",
    dexThresh: 1, salt: mineSalt(label), tax: 1000, migratorType: 1,
    quoteToken: ZERO, quoteAmt: amount, beneficiary, permitData: "0x",
  };
}

async function tryCreate(portal, signer, label, value = ethers.parseEther("0.01")) {
  const p = params(label, signer.address, value);
  try {
    const tx = await portal.connect(signer).newTokenV2(p, { value, gasLimit: 5_000_000 });
    const r = await tx.wait();
    return { ok: true, gasUsed: r.gasUsed.toString() };
  } catch (err) {
    let rawData = null;
    try {
      const iface = new ethers.Interface(PORTAL_ABI);
      const calldata = iface.encodeFunctionData("newTokenV2", [p]);
      await provider.call({ to: PORTAL, from: signer.address, data: calldata, value });
    } catch (cErr) {
      rawData = cErr.data || cErr.info?.error?.data || cErr.error?.data;
      if (rawData && typeof rawData === "object" && rawData.data) rawData = rawData.data;
    }
    return { ok: false, decoded: decode(rawData), rawData };
  }
}

async function setBalance(addr) {
  await provider.send("evm_setAccountBalance", [addr, "0x" + (1000n * 10n ** 18n).toString(16)]);
}

async function increaseTime(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

async function ts() {
  return (await provider.getBlock("latest")).timestamp;
}

function freshSigner() {
  const w = new ethers.Wallet(freshKey(Math.random()), provider);
  const nm = new ethers.NonceManager(w);
  nm.address = w.address;
  return nm;
}

// Probe one wallet: create, wait `waitSec`, retry. Return {createTs, unlockTime, retryOk, retryTs}.
async function probeAtDelay(portal, waitSec) {
  const signer = freshSigner();
  await setBalance(signer.address);
  const c = await tryCreate(portal, signer, `c${waitSec}`);
  if (!c.ok) return { signer: signer.address, waitSec, createOk: false };
  const createTs = await ts();
  if (waitSec > 0) await increaseTime(waitSec);
  const r = await tryCreate(portal, signer, `r${waitSec}`);
  const retryTs = await ts();
  return {
    signer: signer.address,
    waitSec,
    createOk: true,
    createTs,
    retryTs,
    elapsedSec: retryTs - createTs,
    retryOk: r.ok,
    retryDecoded: r.decoded ? { user: r.decoded.user, unlockTime: r.decoded.unlockTime.toString() } : null,
  };
}

async function main() {
  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, provider);
  const results = [];

  console.log(`start ts=${await ts()}`);

  // Coarse probes
  const coarseDelays = [0, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];
  for (const d of coarseDelays) {
    const r = await probeAtDelay(portal, d);
    console.log(`wait=${d}s → createOk=${r.createOk} retryOk=${r.retryOk} elapsed=${r.elapsedSec}s unlockTime=${r.retryDecoded?.unlockTime}`);
    results.push(r);
    // stop on first success
    if (r.retryOk) break;
  }

  // Find boundary by binary search if we got a working delay
  const lastFail = results.filter((r) => r.createOk && !r.retryOk).slice(-1)[0];
  const firstSuccess = results.find((r) => r.retryOk);
  let bsLow = lastFail?.waitSec ?? 0;
  let bsHigh = firstSuccess?.waitSec ?? null;
  console.log(`\ncoarse boundary: lastFail=${bsLow}s firstSuccess=${bsHigh}s`);

  if (bsHigh != null && bsHigh - bsLow > 1) {
    while (bsHigh - bsLow > 1) {
      const mid = Math.floor((bsLow + bsHigh) / 2);
      const r = await probeAtDelay(portal, mid);
      console.log(`bs wait=${mid}s → retryOk=${r.retryOk} elapsed=${r.elapsedSec}s unlockTime=${r.retryDecoded?.unlockTime}`);
      results.push(r);
      if (r.retryOk) bsHigh = mid; else bsLow = mid;
    }
    console.log(`\nminimum wait for retry success: ${bsHigh}s (lastFail=${bsLow}s)`);
  }

  fs.writeFileSync(path.join(__dirname, "cooldown-binsearch.json"), JSON.stringify({ results, bsLow, bsHigh }, null, 2));
  console.log("\n=== written cooldown-binsearch.json ===");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
