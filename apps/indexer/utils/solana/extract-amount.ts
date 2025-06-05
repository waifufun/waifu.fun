import logger from "@autofun/logger";

export class SolanaAmountExtractor {
  static extractAmountGotten(
    transaction: any, 
    tokenMint: string, 
    userAddress: string, 
    direction: number,
    debugStatements: boolean = false
  ): { amountGotten?: string } {
    try {
      const preTokenBalances = transaction.meta?.preTokenBalances || [];
      const postTokenBalances = transaction.meta?.postTokenBalances || [];
      const preBalances = transaction.meta?.preBalances || [];
      const postBalances = transaction.meta?.postBalances || [];
      const fee = transaction.meta?.fee || 0;
      const accountKeys = transaction.transaction?.message?.staticAccountKeys || 
                          transaction.message?.staticAccountKeys || [];

      if (direction === 0) {
        // Direction 0: User is buying tokens (NATIVE TOKEN -> Token)
        const preTokenBalance = preTokenBalances.find((balance: any) => {
          const isCorrectMint = balance.mint === tokenMint;
          const isCorrectOwner = balance.owner === userAddress;
          return isCorrectMint && isCorrectOwner;
        });
        
        const postTokenBalance = postTokenBalances.find((balance: any) => {
          const isCorrectMint = balance.mint === tokenMint;
          const isCorrectOwner = balance.owner === userAddress;
          return isCorrectMint && isCorrectOwner;
        });

        const preAmount = BigInt(preTokenBalance?.uiTokenAmount?.amount || '0');
        const postAmount = BigInt(postTokenBalance?.uiTokenAmount?.amount || '0');
        const tokensReceived = postAmount - preAmount;
        
        if (tokensReceived > 0n) {
          return { amountGotten: tokensReceived.toString() };
        }

        if (!preTokenBalance && postTokenBalance) {
          const tokens = BigInt(postTokenBalance.uiTokenAmount?.amount || '0');
          if (tokens > 0n) {
            return { amountGotten: tokens.toString() };
          }
        }

      } else {
        // Direction 1: User is selling tokens (Token -> NATIVE TOKEN)
        const userIndex = accountKeys.findIndex((key: any) => 
          key.toBase58() === userAddress
        );

        if (userIndex !== -1 && preBalances[userIndex] !== undefined && postBalances[userIndex] !== undefined) {
          const preBalance = BigInt(preBalances[userIndex]);
          const postBalance = BigInt(postBalances[userIndex]);
          
          const solChange = postBalance - preBalance;
          let solReceived = solChange;
          
          if (userIndex === 0) {
            solReceived = solChange + BigInt(fee);
          }
          
          if (solReceived > 0n) {
            return { amountGotten: solReceived.toString() };
          }
        }
      }
      return {};
    } catch (error) {
      if (debugStatements) {
        logger.error("Error extracting amount gotten:", error);
      }
      return {};
    }
  }
}