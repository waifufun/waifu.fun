// For each trial: create with fresh wallet, capture createBlk.timestamp,
// advance time by exactly `wait` seconds, mine, then retry to read unlockTime.
// cooldown_duration = unlockTime - createBlk.timestamp (constant for all waits while still locked)

const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");
const fs = require("fs");
const path = require("path");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x29e6383f0ce68507B5A72a53c2B118a118332Aa8";
const ZERO = ethers.ZeroAddress;
const RATE_LIMIT_SELECTOR = "0xa7382e9b";

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

function cloneInitCode(impl) {
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
}
function predict(salt) {
  return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL)));
}
function mineSalt(label) {
  let s = ethers.keccak256(ethers.toUtf8Bytes(`pp2 ${label} ${Date.now()} ${Math.random()}`));
  while (!predict(s).toLowerCase().endsWith("7777")) s = ethers.keccak256(s);
  return s;
}

const PORTAL_ABI = [
  "function newTokenV2((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint16 tax,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData) params) payable returns (address)",
];

function decode(hex) {
  if (!hex || !hex.startsWith(RATE_LIMIT_SELECTOR)) return null;
  try {
    const [user, unlockTime] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], "0x" + hex.slice(10));
    return { user, unlockTime };
  } catch { return null; }
}

function buildParams(label, beneficiary, value) {
  return {
    name: `T${label}`.slice(0, 12),
    symbol: `T${label}`.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8),
    meta: "QmPP2",
    dexThresh: 1, salt: mineSalt(label), tax: 1000, migratorType: 1,
    quoteToken: ZERO, quoteAmt: value, beneficiary, permitData: "0x",
  };
}

async function tryCreate(portal, signer, label) {
  const value = ethers.parseEther("0.01");
  const p = buildParams(label, signer.address, value);
  try {
    const tx = await portal.connect(signer).newTokenV2(p, { value, gasLimit: 5_000_000 });
    const r = await tx.wait();
    return { ok: true, blockNumber: r.blockNumber };
  } catch (err) {
    let raw = null;
    try {
      const iface = new ethers.Interface(PORTAL_ABI);
      await provider.call({ to: PORTAL, from: signer.address, data: iface.encodeFunctionData("newTokenV2", [p]), value });
    } catch (cErr) {
      raw = cErr.data || cErr.info?.error?.data || cErr.error?.data;
      if (raw && typeof raw === "object" && raw.data) raw = raw.data;
    }
    return { ok: false, decoded: decode(raw) };
  }
}

async function main() {
  const results = [];
  const trials = [
    { wait: 0, expectSuccess: false },
    { wait: 80, expectSuccess: false },
    { wait: 85, expectSuccess: false },
    { wait: 88, expectSuccess: false },
    { wait: 89, expectSuccess: false },
    { wait: 90, expectSuccess: true },
  ];

  for (const { wait, expectSuccess } of trials) {
    const w = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes(`pp2 ${wait} ${Math.random()}`)), provider);
    const signer = new ethers.NonceManager(w);
    signer.address = w.address;
    await provider.send("evm_setAccountBalance", [w.address, "0x" + (100n * 10n**18n).toString(16)]);
    const portal = new ethers.Contract(PORTAL, PORTAL_ABI, signer);

    const c = await tryCreate(portal, signer, `c${wait}`);
    if (!c.ok) { console.log(`wait=${wait}: create FAILED`); continue; }
    const createBlk = await provider.getBlock(c.blockNumber);

    if (wait > 0) {
      await provider.send("evm_increaseTime", [wait]);
      await provider.send("evm_mine", []);
    }
    const r = await tryCreate(portal, signer, `r${wait}`);
    const retryBlk = await provider.getBlock("latest");
    const elapsed = retryBlk.timestamp - createBlk.timestamp;
    const unlock = r.decoded ? Number(r.decoded.unlockTime) : null;
    const cd = unlock != null ? unlock - createBlk.timestamp : null;
    console.log(`wait=${wait}: createTs=${createBlk.timestamp} retryTs=${retryBlk.timestamp} elapsed=${elapsed}s retryOk=${r.ok} unlockTime=${unlock} cooldown=${cd}s ${r.ok === expectSuccess ? "✓" : "✗"}`);
    results.push({ wait, eoa: w.address, createTs: createBlk.timestamp, retryTs: retryBlk.timestamp, elapsedSec: elapsed, retryOk: r.ok, unlockTime: unlock, cooldownSec: cd });
  }

  fs.writeFileSync(path.join(__dirname, "cooldown-pinpoint2.json"), JSON.stringify(results, null, 2));
  console.log("\n=== written cooldown-pinpoint2.json ===");
  const cooldowns = results.filter((r) => r.cooldownSec != null).map((r) => r.cooldownSec);
  const distinct = [...new Set(cooldowns)];
  console.log(`distinct cooldown values measured: ${distinct.join(", ")}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
