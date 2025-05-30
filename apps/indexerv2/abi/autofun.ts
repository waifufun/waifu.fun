import { PublicKey } from '@solana/web3.js';

export const programId = new PublicKey('YourAutofunProgramIdHere');

export const instructions = {
  launch: {
    name: 'launch',
    d8: 0,
    decode: (data: Buffer) => {
      // Decode the launch instruction data
      return {
        data: {
          name: data.toString('utf-8', 0, 32).trim(),
          symbol: data.toString('utf-8', 32, 64).trim(),
          uri: data.toString('utf-8', 64, 96).trim(),
          decimals: data.readUInt8(96),
        },
        accounts: {
          token: data.slice(97, 129).toString('hex'),
          creator: data.slice(129, 161).toString('hex'),
        },
      };
    },
  },
  swap: {
    name: 'swap',
    d8: 1,
    decode: (data: Buffer) => {
      return {
        data: {
          amount: data.readBigUInt64LE(0),
          direction: data.readUInt8(8),
          minimumReceiveAmount: data.readBigUInt64LE(9),
        },
        accounts: {
          tokenMint: data.slice(17, 49).toString('hex'),
          user: data.slice(49, 81).toString('hex'),
        },
      };
    },
  },
  launchAndSwap: {
    name: 'launchAndSwap',
    d8: 2,
    decode: (data: Buffer) => {
      return {
        data: {
          name: data.toString('utf-8', 0, 32).trim(),
          symbol: data.toString('utf-8', 32, 64).trim(),
          uri: data.toString('utf-8', 64, 96).trim(),
          decimals: data.readUInt8(96),
          swapAmount: data.readBigUInt64LE(97),
          minimumReceiveAmount: data.readBigUInt64LE(105),
        },
        accounts: {
          token: data.slice(113, 145).toString('hex'),
          creator: data.slice(145, 177).toString('hex'),
        },
      };
    },
  },
  events: {
    CompleteEvent: {
      name: 'CompleteEvent',
      decode: (data: Buffer) => {
        return {
          user: data.slice(0, 32).toString('hex'),
          mint: data.slice(32, 64).toString('hex'),
          bondingCurve: data.slice(64, 96).toString('hex'),
        };
      },
    },
  },
};