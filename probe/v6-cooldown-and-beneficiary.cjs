// Two narrow follow-ups:
//   1. Verify the cooldown unlock works on V6 (E3b reverted earlier; likely an unrelated salt collision or time issue)
//   2. Confirm V6 beneficiary != msg.sender behaviour with a fresh EOA pair and inspect on-chain state
//   3. Test V6 via contract caller (wrapper) with beneficiary = wrapper, then beneficiary = different EOA

const fs = require("fs");
const { ethers } = require("/home/shad0w/projects/waifu.fun-wt/flap-bundle-probe/packages/contracts-evm/node_modules/ethers");

const RPC = "http://127.0.0.1:8546";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TAX_TOKEN_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const ZERO = ethers.ZeroAddress;

const provider = new ethers.JsonRpcProvider(RPC, 56, { batchMaxCount: 1 });

const PORTAL_ABI = [
  "function version() view returns (string)",
  "function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address)",
];

const portalIface = new ethers.Interface(PORTAL_ABI);

function cloneInitCode(impl) { return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`; }
function predict(salt) { return ethers.getCreate2Address(PORTAL, salt, ethers.keccak256(cloneInitCode(TAX_TOKEN_V3_IMPL))); }
function mineSalt(label) {
  let salt = ethers.keccak256(ethers.toUtf8Bytes(`v6-cd-bene ${label} ${Date.now()} ${Math.random()}`));
  let it = 0;
  while (!predict(salt).toLowerCase().endsWith("7777")) { salt = ethers.keccak256(salt); it++; }
  return { salt, predicted: predict(salt), iterations: it };
}
async function setBal(a) { await provider.send("anvil_setBalance", [a, "0x" + (1000n * 10n ** 18n).toString(16)]); }

function v6P({ name, symbol, beneficiary, commissionReceiver, quoteAmt, salt }) {
  return {
    name, symbol,
    meta: "bafkreicdQmTestQmTestQmTestQmTestQmTestQmTest",
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

// Try to call eth_call to surface revert data even when sendTransaction swallows it
async function staticCallV6(from, params, value) {
  const data = portalIface.encodeFunctionData("newTokenV6", [params]);
  try {
    await provider.call({ from, to: PORTAL, data, value });
    return { ok: true };
  } catch (err) {
    const ed = err.data || err.info?.error?.data;
    return { ok: false, ed };
  }
}

async function main() {
  const out = {};
  const baseSeed = ethers.hexlify(ethers.randomBytes(32));
  const A = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("A")])).slice(0, 66), provider);
  const B = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("B")])).slice(0, 66), provider);
  const C = new ethers.Wallet(ethers.keccak256(ethers.concat([baseSeed, ethers.toUtf8Bytes("C")])).slice(0, 66), provider);
  await setBal(A.address); await setBal(B.address); await setBal(C.address);
  console.log(`A=${A.address} B=${B.address} C=${C.address}`);

  // 1) First V6 by A → should succeed
  const m1 = mineSalt("CD1");
  const p1 = v6P({ name: "CD1", symbol: "CD1", beneficiary: A.address, commissionReceiver: A.address, quoteAmt: ethers.parseEther("0.01"), salt: m1.salt });
  const r1 = await callV6(A, p1, ethers.parseEther("0.01"));
  console.log(`CD1 (A first): ok=${r1.ok} gas=${r1.receipt?.gasUsed}`);
  out.cd1 = { ok: r1.ok };

  // 2) Second V6 by A immediately → should revert with RateLimitExceeded
  const m2 = mineSalt("CD2");
  const p2 = v6P({ name: "CD2", symbol: "CD2", beneficiary: A.address, commissionReceiver: A.address, quoteAmt: ethers.parseEther("0.01"), salt: m2.salt });
  const r2 = await callV6(A, p2, ethers.parseEther("0.01"));
  // also static call to surface error data
  const s2 = await staticCallV6(A.address, p2, ethers.parseEther("0.01"));
  console.log(`CD2 (A retry, no wait): ok=${r2.ok} err=${r2.ed} staticErr=${s2.ed?.slice(0, 10)}`);
  out.cd2 = { ok: r2.ok, txErr: r2.ed, staticErr: s2.ed?.slice(0, 10) };
  if (s2.ed && s2.ed.startsWith("0xa7382e9b")) {
    const decoder = ethers.AbiCoder.defaultAbiCoder();
    try {
      const [user, unlock] = decoder.decode(["address", "uint256"], "0x" + s2.ed.slice(10));
      const now = (await provider.getBlock("latest")).timestamp;
      out.cd2.user = user;
      out.cd2.unlockTime = unlock.toString();
      out.cd2.now = now;
      out.cd2.cooldownSec = Number(unlock - BigInt(now));
      console.log(`CD2 RateLimitExceeded user=${user} unlockTime=${unlock} now=${now} delta=${out.cd2.cooldownSec}s`);
    } catch (_) {}
  }

  // 3) Bump time + mine, then retry → should succeed
  await provider.send("evm_increaseTime", [95]);
  await provider.send("evm_mine", []);
  const m3 = mineSalt("CD3");
  const p3 = v6P({ name: "CD3", symbol: "CD3", beneficiary: A.address, commissionReceiver: A.address, quoteAmt: ethers.parseEther("0.01"), salt: m3.salt });
  const r3 = await callV6(A, p3, ethers.parseEther("0.01"));
  const s3 = await staticCallV6(A.address, p3, ethers.parseEther("0.01"));
  console.log(`CD3 (A after +95s): ok=${r3.ok} gas=${r3.receipt?.gasUsed} err=${r3.ed} staticErr=${s3.ed?.slice(0, 10)}`);
  out.cd3 = { ok: r3.ok, gas: r3.receipt?.gasUsed?.toString(), txErr: r3.ed, staticErr: s3.ed?.slice(0, 10) };

  // 4) V6 from B with beneficiary = C (distinct from signer)
  await provider.send("evm_increaseTime", [200]);
  await provider.send("evm_mine", []);
  const m4 = mineSalt("BEN1");
  const p4 = v6P({ name: "BEN1", symbol: "BEN1", beneficiary: C.address, commissionReceiver: B.address, quoteAmt: ethers.parseEther("0.01"), salt: m4.salt });
  const r4 = await callV6(B, p4, ethers.parseEther("0.01"));
  console.log(`BEN1 (B signs, beneficiary=C): ok=${r4.ok} gas=${r4.receipt?.gasUsed} err=${r4.ed} msg=${r4.msg?.slice(0, 120) || ""}`);
  out.beneficiaryDistinct = { ok: r4.ok, gas: r4.receipt?.gasUsed?.toString(), err: r4.ed, msg: r4.msg };
  if (r4.ok) {
    const tk = new ethers.Contract(m4.predicted, ["function balanceOf(address) view returns (uint256)"], provider);
    const balB = await tk.balanceOf(B.address);
    const balC = await tk.balanceOf(C.address);
    out.beneficiaryDistinct.balB = balB.toString();
    out.beneficiaryDistinct.balC = balC.toString();
    console.log(`BEN1 token balances: B=${ethers.formatEther(balB)} C=${ethers.formatEther(balC)}`);
  }

  fs.writeFileSync(__dirname + "/v6-cooldown-and-beneficiary.json", JSON.stringify(out, null, 2));
  console.log("\nwrote v6-cooldown-and-beneficiary.json");
}

main().catch(e => { console.error(e); process.exit(1); });
