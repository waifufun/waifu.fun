import {Codec, struct, option, u64, tuple, array, sum, u8, address, bool, f64, u128, ref} from '@subsquid/borsh'

export type AmountConfigU64_Range = {
    min?: bigint | undefined
    max?: bigint | undefined
}

export const AmountConfigU64_Range = struct({
    min: option(u64),
    max: option(u64),
})

export type AmountConfigU64_Enum = [
    Array<bigint>,
]

export const AmountConfigU64_Enum = tuple([
    array(u64),
])

export type AmountConfigU64 = 
    | {
        kind: 'Range'
        value: AmountConfigU64_Range
      }
    | {
        kind: 'Enum'
        value: AmountConfigU64_Enum
      }

export const AmountConfigU64: Codec<AmountConfigU64> = sum(1, {
    Range: {
        discriminator: 0,
        value: AmountConfigU64_Range,
    },
    Enum: {
        discriminator: 1,
        value: AmountConfigU64_Enum,
    },
})

export type AmountConfigU8_Range = {
    min?: number | undefined
    max?: number | undefined
}

export const AmountConfigU8_Range = struct({
    min: option(u8),
    max: option(u8),
})

export type AmountConfigU8_Enum = [
    Array<number>,
]

export const AmountConfigU8_Enum = tuple([
    array(u8),
])

export type AmountConfigU8 = 
    | {
        kind: 'Range'
        value: AmountConfigU8_Range
      }
    | {
        kind: 'Enum'
        value: AmountConfigU8_Enum
      }

export const AmountConfigU8: Codec<AmountConfigU8> = sum(1, {
    Range: {
        discriminator: 0,
        value: AmountConfigU8_Range,
    },
    Enum: {
        discriminator: 1,
        value: AmountConfigU8_Enum,
    },
})

export interface BondingCurve {
    tokenMint: string
    creator: string
    initLamport: bigint
    reserveLamport: bigint
    reserveToken: bigint
    curveLimit: bigint
    isCompleted: boolean
}

export const BondingCurve: Codec<BondingCurve> = struct({
    tokenMint: address,
    creator: address,
    initLamport: u64,
    reserveLamport: u64,
    reserveToken: u64,
    curveLimit: u64,
    isCompleted: bool,
})

export interface CompleteEvent {
    user: string
    mint: string
    bondingCurve: string
}

export const CompleteEvent: Codec<CompleteEvent> = struct({
    user: address,
    mint: address,
    bondingCurve: address,
})

export interface Config {
    authority: string
    pendingAuthority: string
    teamWallet: string
    initBondingCurve: number
    platformBuyFee: bigint
    platformSellFee: bigint
    curveLimit: bigint
    lamportAmountConfig: AmountConfigU64
    tokenSupplyConfig: AmountConfigU64
    tokenDecimalsConfig: AmountConfigU8
}

export const Config: Codec<Config> = struct({
    authority: address,
    pendingAuthority: address,
    teamWallet: address,
    initBondingCurve: f64,
    platformBuyFee: u128,
    platformSellFee: u128,
    curveLimit: u64,
    lamportAmountConfig: ref(() => AmountConfigU64),
    tokenSupplyConfig: ref(() => AmountConfigU64),
    tokenDecimalsConfig: ref(() => AmountConfigU8),
})
