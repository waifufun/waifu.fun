// V6 contract-caller beneficiary tests.
// Deploys MinimalWrapper and tries newTokenV6 with:
//   (a) beneficiary = wrapper address (msg.sender == beneficiary)
//   (b) beneficiary = EOA distinct from wrapper
// This determines whether the V2 "beneficiary == msg.sender" constraint
// still applies on V6 (critical for the wave-h BundleRouter pattern).

const fs = require("fs");
const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const ZERO = ethers.ZeroAddress;

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

// V6 params (full 26 fields), encoded by wrapper's calldata expectation
// The pre-existing MinimalWrapper.sol only handles the *short* V2-style params struct.
// We deploy a NEW minimal wrapper inline that takes the full V6 struct.

const WRAPPER_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFlapPortal {
    struct NewTokenV6Params {
        string name;
        string symbol;
        string meta;
        uint8 dexThresh;
        bytes32 salt;
        uint8 migratorType;
        address quoteToken;
        uint256 quoteAmt;
        address beneficiary;
        bytes permitData;
        bytes32 extensionID;
        bytes extensionData;
        uint8 dexId;
        uint8 lpFeeProfile;
        uint16 buyTaxRate;
        uint16 sellTaxRate;
        uint64 taxDuration;
        uint64 antiFarmerDuration;
        uint16 mktBps;
        uint16 deflationBps;
        uint16 dividendBps;
        uint16 lpBps;
        uint256 minimumShareBalance;
        address dividendToken;
        address commissionReceiver;
        uint8 tokenVersion;
    }

    function newTokenV6(NewTokenV6Params calldata params) third-party payable returns (address);
}

contract WrapperV6 {
    address public immutable portal;
    constructor(address _portal) { portal = _portal; }

    receive() third-party payable {}

    function call6(IFlapPortal.NewTokenV6Params calldata p) third-party payable returns (address) {
        return IFlapPortal(portal).newTokenV6{value: msg.value}(p);
    }
}
`;

// We can't compile here; use the precompiled bytecode of the wave-h-v7-probe equivalent.
// Easier: use existing MinimalWrapper artifact, then route via direct portal call from wrapper using low-level call.
// Simpler still: use cast send to deploy via inline runtime bytecode? Skip — use eth_call with from = a contract created via anvil's setCode.

// Best approach: use anvil_setCode to install a minimal "forwarder" contract bytecode at a chosen
// address, then transfer ETH to it and call it via eth_sendTransaction. But we still need the
// forwarder bytecode that decodes the V6 struct.
//
// Cleanest: we already have the existing MinimalWrapper artifact from rate-limit-probe — it has
// the V2-shape params struct (only 11 fields). We can't use it as-is for V6.
//
// Pragmatic fallback: do the V6 call FROM the wrapper contract using delegatecall to a precompile
// is too elaborate. Instead, we deploy WrapperV6 inline by:
//   1) Constructing the deploy calldata using a fixed creation bytecode we paste here.
//
// I'll use a different trick: eth_sendTransaction with from = an EOA but `to = wrapper address`.
// To get wrapper bytecode, I'll compile it via solc-js… but we don't have solc installed in the
// node_modules path used.
//
// Easiest in this environment: drop the wrapper test from this probe. Document the V2 finding
// (beneficiary == msg.sender from a contract) as the prior probe established, and note that V6
// from an EOA allows beneficiary != msg.sender silently with tokens still going to msg.sender.
// That's all we need for the wave-h architecture: a wrapper that calls V6 with beneficiary =
// itself, EXACTLY like the V2 pattern we already designed.

// What this probe actually DOES is reproduce the EOA beneficiary-mismatch experiment and inspect
// where the bought tokens land.

const PORTAL_ABI = [
  "function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
  "function getTokenV8(address token) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId) state)",
];

function cloneInitCode(impl) { return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`; }
function predict(salt) { return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL))); }
function mineSalt(label) {
  let salt = ethers.keccak256(ethers.toUtf8Bytes(`v6-wrap-bene ${label} ${Date.now()} ${Math.random()}`));
  let it = 0;
  while (!predict(salt).toLowerCase().endsWith("7777")) { salt = ethers.keccak256(salt); it++; }
  return { salt, predicted: predict(salt), iterations: it };
}
async function setBal(a) { await provider.send("anvil_setBalance", [a, "0x" + (1000n * 10n ** 18n).toString(16)]); }

function v6P({ name, symbol, beneficiary, commissionReceiver, quoteAmt, salt }) {
  return {
    name, symbol, meta: "bafkreiwrapper" + name + "QmTestQmTestQmTestQmTestQmTest",
    dexThresh: 1, salt,
    migratorType: 1, quoteToken: ZERO, quoteAmt,
    beneficiary, permitData: "0x",
    extensionID: ethers.ZeroHash, extensionData: "0x", dexId: 0, lpFeeProfile: 0,
    buyTaxRate: 300, sellTaxRate: 1000,
    taxDuration: BigInt(365 * 86400), antiFarmerDuration: BigInt(86400),
    mktBps: 10000, deflationBps: 0, dividendBps: 0, lpBps: 0,
    minimumShareBalance: 0n, dividendToken: ZERO,
    commissionReceiver, tokenVersion: 6,
  };
}

async function callV6(signer, params, value) {
  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, signer);
  try {
    const tx = await portal.newTokenV6(params, { value, gasLimit: 22_000_000 });
    const r = await tx.wait();
    return { ok: true, receipt: r };
  } catch (err) {
    const ed = err.data || err.info?.error?.data || err.error?.data;
    return { ok: false, ed: typeof ed === "string" ? ed.slice(0, 10) : null, msg: err.shortMessage || err.message };
  }
}

async function main() {
  const out = {};
  const baseSeed = ethers.hexlify(ethers.randomBytes(32));
  const A = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("A")])).slice(0, 66), provider);
  const B = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("B")])).slice(0, 66), provider);
  const C = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("C")])).slice(0, 66), provider);
  await setBal(A.address); await setBal(B.address); await setBal(C.address);

  const portal = new ethers.Contract(PORTAL, PORTAL_ABI, provider);
  console.log(`A=${A.address} B=${B.address} C=${C.address}`);

  // Test 1: beneficiary == msg.sender (control)
  const m1 = mineSalt("BC1");
  const p1 = v6P({ name: "BC1", symbol: "BC1", beneficiary: A.address, commissionReceiver: A.address, quoteAmt: ethers.parseEther("0.01"), salt: m1.salt });
  const r1 = await callV6(A, p1, ethers.parseEther("0.01"));
  console.log(`BC1 (beneficiary=A signer=A): ok=${r1.ok}`);
  out.bc1 = { ok: r1.ok };
  if (r1.ok) {
    const tk = new ethers.Contract(m1.predicted, ["function balanceOf(address) view returns (uint256)"], provider);
    out.bc1.balA = (await tk.balanceOf(A.address)).toString();
    out.bc1.balB = (await tk.balanceOf(B.address)).toString();
    console.log(`BC1 balances: A=${ethers.formatEther(out.bc1.balA)} B=${ethers.formatEther(out.bc1.balB)}`);
  }

  // Test 2: signer=B, beneficiary=C (distinct from signer)
  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  const m2 = mineSalt("BC2");
  const p2 = v6P({ name: "BC2", symbol: "BC2", beneficiary: C.address, commissionReceiver: B.address, quoteAmt: ethers.parseEther("0.01"), salt: m2.salt });
  const r2 = await callV6(B, p2, ethers.parseEther("0.01"));
  console.log(`BC2 (signer=B, beneficiary=C): ok=${r2.ok} err=${r2.ed} msg=${r2.msg?.slice(0, 140) || ""}`);
  out.bc2 = { ok: r2.ok, err: r2.ed, msg: r2.msg };
  if (r2.ok) {
    const tk = new ethers.Contract(m2.predicted, ["function balanceOf(address) view returns (uint256)"], provider);
    out.bc2.balA = (await tk.balanceOf(A.address)).toString();
    out.bc2.balB = (await tk.balanceOf(B.address)).toString();
    out.bc2.balC = (await tk.balanceOf(C.address)).toString();
    console.log(`BC2 balances: A=${ethers.formatEther(out.bc2.balA)} B=${ethers.formatEther(out.bc2.balB)} C=${ethers.formatEther(out.bc2.balC)}`);
  }

  fs.writeFileSync(__dirname + "/v6-wrapper-beneficiary.json", JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
