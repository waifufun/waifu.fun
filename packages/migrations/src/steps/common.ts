import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import type { MigrationStep, MigrationContext } from '../types';
import { withdrawLiquidity, handleTransaction, sendNftToManager, collectProtocolFees } from '../utils/protocol-utils';
import { BN } from '@coral-xyz/anchor';

export const commonWithdrawStep: MigrationStep = {
  name: 'withdraw',
  description: 'Withdraw liquidity from pool',
  execute: async (context: MigrationContext) => {
    const { state } = context;
    await withdrawLiquidity(context, state.tokenMint);
  },
  rollback: async (context: MigrationContext) => {
    throw new Error('Not implemented');
  }
};

export const commonSendNftStep: MigrationStep = {
  name: 'sendNft',
  description: 'Send NFT to manager multisig',
  execute: async (context: MigrationContext) => {
    const { state } = context;
    const { nftMint } = state;
    if (!nftMint) {
      throw new Error('NFT mint not found in state');
    }
    await sendNftToManager(context, nftMint, process.env.ACCOUNT_FEE_MULTISIG!);
  },
  rollback: async (context: MigrationContext) => {
    throw new Error('Not implemented');
  }
};

export const commonCollectFeesStep: MigrationStep = {
  name: 'collectFees',
  description: 'Collect protocol fees',
  execute: async (context: MigrationContext) => {
    const { state } = context;
    const { nftDeposited } = state;
    if (!nftDeposited) {
      throw new Error('NFT not deposited');
    }
    const result = await collectProtocolFees(context, state.tokenMint);
    state.txId = result.txId;
  },
  rollback: async (context: MigrationContext) => {
    throw new Error('Not implemented');
  }
}; 