import {unit, struct, u8, u64, string, i64, address} from '@subsquid/borsh'
import {instruction} from '../abi.support'
import {Config} from './types'

export type AcceptAuthority = undefined

export const acceptAuthority = instruction(
    {
        d8: '0x6b56c65b210c6ba0',
    },
    {
        newAdmin: 0,
        globalConfig: 1,
    },
    unit,
)

export interface Configure {
    newConfig: Config
}

export const configure = instruction(
    {
        d8: '0xf5076c755fc436d9',
    },
    {
        payer: 0,
        config: 1,
        globalVault: 2,
        globalWsolAccount: 3,
        nativeMint: 4,
        systemProgram: 5,
        tokenProgram: 6,
        associatedTokenProgram: 7,
    },
    struct({
        newConfig: Config,
    }),
)

export interface Launch {
    decimals: number
    tokenSupply: bigint
    virtualLamportReserves: bigint
    name: string
    symbol: string
    uri: string
}

export const launch = instruction(
    {
        d8: '0x99f15de116454a3d',
    },
    {
        globalConfig: 0,
        globalVault: 1,
        creator: 2,
        token: 3,
        bondingCurve: 4,
        tokenMetadataAccount: 5,
        globalTokenAccount: 6,
        systemProgram: 7,
        rent: 8,
        tokenProgram: 9,
        associatedTokenProgram: 10,
        mplTokenMetadataProgram: 11,
        teamWallet: 12,
        teamWalletAta: 13,
    },
    struct({
        decimals: u8,
        tokenSupply: u64,
        virtualLamportReserves: u64,
        name: string,
        symbol: string,
        uri: string,
    }),
)

export interface LaunchAndSwap {
    decimals: number
    tokenSupply: bigint
    virtualLamportReserves: bigint
    name: string
    symbol: string
    uri: string
    swapAmount: bigint
    minimumReceiveAmount: bigint
    deadline: bigint
}

export const launchAndSwap = instruction(
    {
        d8: '0x43c9be0fb9292f7a',
    },
    {
        globalConfig: 0,
        globalVault: 1,
        creator: 2,
        token: 3,
        bondingCurve: 4,
        tokenMetadataAccount: 5,
        globalTokenAccount: 6,
        teamWallet: 7,
        teamWalletAta: 8,
        userAta: 9,
        systemProgram: 10,
        rent: 11,
        tokenProgram: 12,
        associatedTokenProgram: 13,
        mplTokenMetadataProgram: 14,
    },
    struct({
        decimals: u8,
        tokenSupply: u64,
        virtualLamportReserves: u64,
        name: string,
        symbol: string,
        uri: string,
        swapAmount: u64,
        minimumReceiveAmount: u64,
        deadline: i64,
    }),
)

export interface NominateAuthority {
    newAdmin: string
}

export const nominateAuthority = instruction(
    {
        d8: '0x94b6905bba0c7612',
    },
    {
        admin: 0,
        globalConfig: 1,
    },
    struct({
        newAdmin: address,
    }),
)

export interface Swap {
    amount: bigint
    direction: number
    minimumReceiveAmount: bigint
    deadline: bigint
}

export const swap = instruction(
    {
        d8: '0xf8c69e91e17587c8',
    },
    {
        globalConfig: 0,
        teamWallet: 1,
        teamWalletAta: 2,
        bondingCurve: 3,
        globalVault: 4,
        tokenMint: 5,
        globalAta: 6,
        userAta: 7,
        user: 8,
        systemProgram: 9,
        tokenProgram: 10,
        associatedTokenProgram: 11,
    },
    struct({
        amount: u64,
        direction: u8,
        minimumReceiveAmount: u64,
        deadline: i64,
    }),
)

export type Withdraw = undefined

export const withdraw = instruction(
    {
        d8: '0xb712469c946da122',
    },
    {
        globalConfig: 0,
        globalVault: 1,
        admin: 2,
        tokenMint: 3,
        bondingCurve: 4,
        globalVaultAta: 5,
        adminAta: 6,
        systemProgram: 7,
        tokenProgram: 8,
        associatedTokenProgram: 9,
    },
    unit,
)
