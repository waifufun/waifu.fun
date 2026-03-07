# Auto-Fun-SC-Audit

Vendored from [elizaOS/Auto-Fun-SC-Audit](https://github.com/elizaOS/Auto-Fun-SC-Audit)
at commit `68cab345e6e21ff799b07d2317e9673d64ad06bc`.

This directory is reference Anchor source only. The canonical deployed
WaifuFun/Autofun interfaces used by the app remain the IDLs and generated types
in [`packages/programs`](../../programs).

A Solana program implementing bonding curve token sales and swaps.

## Overview

Autofun is a Solana program that enables token sales and swaps using bonding curve mechanics. It allows projects to launch tokens with predefined pricing curves and provides functionality for users to buy and sell tokens against SOL.

## Build

```
anchor build
```

## Key Features

- Bonding curve-based token sales
- Configurable pricing curves
- Token swaps against SOL
- Admin controls for project teams
- Secure withdrawal mechanisms

## Program Accounts

### Global Config
Stores program-wide configuration including:
- Authority address
- Team wallet
- Pending authority for admin transfers

### Bonding Curve
Per-token configuration storing:
- Token mint
- Pricing parameters
- Supply tracking

### Global Vault 
Secure PDA that holds SOL from token sales

## Key Instructions

### Admin
- `nominate_authority` - Transfer admin rights to new address
- `withdraw` - Allow admins to withdraw tokens from bonding curve for migrations

### Trading
- `swap` - Buy/sell tokens against the bonding curve
- Automatic price calculations based on supply

## Security

The program implements various security checks including:
- PDA validation
- Authority verification
- Supply/balance tracking
- Secure fund management

## Development

Built using:
- Anchor framework
- Solana Program Library (SPL) tokens
- Native Solana system program integration
