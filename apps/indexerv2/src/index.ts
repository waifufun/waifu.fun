import { EVMRpcProvider, SolanaRpcProvider } from "@autofun/rpc";
import { SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";

const autoFunAddress = "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5";

const rpc = new SolanaRpcProvider(SolanaNetworkIds.Mainnet);

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

function replacer(key: string, value: any) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

const decodeAutofunInstruction = (
  instructionData: Buffer,
  accounts: string[]
) => {
  const discriminator = Array.from(instructionData.slice(0, 8));

  if (arraysEqual(discriminator, IDLInstructions.launch.d8)) {
    console.log("Matched launch instruction");
    const decoded = IDLInstructions.launch.decode(instructionData);

    const mintAddress = accounts[3];
    const creator = accounts[2];

    return {
      type: "launch",
      data: decoded,
      mintAddress,
      creator,
      accounts,
    };
  } else if (arraysEqual(discriminator, IDLInstructions.swap.d8)) {
    console.log("Matched swap instruction");
    const decoded = IDLInstructions.swap.decode(instructionData);

    const tokenMint = accounts[4];
    const user = accounts[7];

    return {
      type: "swap",
      data: decoded,
      tokenMint,
      user,
      accounts,
    };
  } else if (arraysEqual(discriminator, IDLInstructions.launchAndSwap.d8)) {
    console.log("Matched launchAndSwap instruction");
    const decoded = IDLInstructions.launchAndSwap.decode(instructionData);

    const mintAddress = accounts[3];
    const creator = accounts[2];

    return {
      type: "launchAndSwap",
      data: decoded,
      mintAddress,
      creator,
      accounts,
    };
  }

  return {
    type: "unknown",
    discriminator: discriminator,
    accounts,
  };
};

(async () => {
  // same block that SQUID launched
  const blocks = await rpc.getBlock(336725834);
  if (!blocks) {
    console.log("No block found");
    return;
  }

  console.log(
    `Processing block with ${blocks.transactions.length} transactions`
  );

  for (const transaction of blocks.transactions) {
    const accounts = transaction.transaction.message.staticAccountKeys.map(
      (key) => key.toBase58()
    );

    if (accounts.includes(autoFunAddress)) {
      console.log(
        `\n=== Transaction ${transaction.transaction.signatures[0]} ===`
      );
      console.log("Fee payer:", accounts[0]);

      for (const instruction of transaction.transaction.message
        .compiledInstructions) {
        const programId =
          transaction.transaction.message.staticAccountKeys[
            instruction.programIdIndex
          ].toBase58();

        if (programId === autoFunAddress) {
          console.log("\n--- AutoFun Instruction ---");

          const instructionAccounts = instruction.accountKeyIndexes.map(
            (index) => accounts[index]
          );

          const decodedInstruction = decodeAutofunInstruction(
            Buffer.from(instruction.data),
            instructionAccounts
          );

          console.log("Decoded instruction type:", decodedInstruction.type);

          if (decodedInstruction.type !== "unknown") {
            if (decodedInstruction.type === "launch") {
              console.log("=== TOKEN LAUNCH ===");
              console.log("Mint Address:", decodedInstruction.mintAddress);
              console.log("Creator:", decodedInstruction.creator);
              console.log("Token Details:");
              console.log("  Name:", decodedInstruction.data.data.name);
              console.log("  Symbol:", decodedInstruction.data.data.symbol);
              console.log("  URI:", decodedInstruction.data.data.uri);
              console.log("  Decimals:", decodedInstruction.data.data.decimals);
              console.log(
                "  Token Supply:",
                decodedInstruction.data.data.tokenSupply.toString()
              );
              console.log(
                "  Virtual Lamport Reserves:",
                decodedInstruction.data.data.virtualLamportReserves.toString()
              );
            } else if (decodedInstruction.type === "swap") {
              console.log("=== TOKEN SWAP ===");
              console.log("Token Mint:", decodedInstruction.tokenMint);
              console.log("User:", decodedInstruction.user);
              console.log("Swap Details:");
              console.log(
                "  Amount:",
                decodedInstruction.data.data.amount.toString()
              );
              console.log(
                "  Direction:",
                decodedInstruction.data.data.direction === 0 ? "Buy" : "Sell"
              );
              console.log(
                "  Minimum Receive:",
                decodedInstruction.data.data.minimumReceiveAmount.toString()
              );
              console.log(
                "  Deadline:",
                decodedInstruction.data.data.deadline.toString()
              );
            } else if (decodedInstruction.type === "launchAndSwap") {
              console.log("=== LAUNCH AND SWAP ===");
              console.log("Mint Address:", decodedInstruction.mintAddress);
              console.log("Creator:", decodedInstruction.creator);
              console.log("Token Details:");
              console.log("  Name:", decodedInstruction.data.data.name);
              console.log("  Symbol:", decodedInstruction.data.data.symbol);
              console.log("  URI:", decodedInstruction.data.data.uri);
              console.log("  Decimals:", decodedInstruction.data.data.decimals);
              console.log(
                "  Token Supply:",
                decodedInstruction.data.data.tokenSupply.toString()
              );
              console.log(
                "  Virtual Lamport Reserves:",
                decodedInstruction.data.data.virtualLamportReserves.toString()
              );
              console.log("Swap Details:");
              console.log(
                "  Swap Amount:",
                decodedInstruction.data.data.swapAmount.toString()
              );
              console.log(
                "  Minimum Receive:",
                decodedInstruction.data.data.minimumReceiveAmount.toString()
              );
              console.log(
                "  Deadline:",
                decodedInstruction.data.data.deadline.toString()
              );
            }
          }
        }
      }
    }
  }
})();
