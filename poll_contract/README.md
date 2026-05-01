# Poll Contract

## Overview

This folder contains the Soroban smart contract used by LivePoll for storing polls, votes, and poll status on Stellar testnet.

## Main Files

- `src/lib.rs` contains the contract logic
- `Cargo.toml` defines the Rust package and Soroban dependency

## Network Details

- Network: `Stellar Testnet`
- Contract address: `CD53KJA5OU43QYVJ3GNU72LCWOTJWPFIIXFSCABWQ7B55Y7G3OGARKMM`
- Contract explorer: https://stellar.expert/explorer/testnet/contract/CD53KJA5OU43QYVJ3GNU72LCWOTJWPFIIXFSCABWQ7B55Y7G3OGARKMM
- Sample `create_poll` tx hash: `7e4cf4726ac994cfe672e2dbe12a85ce9f3cac0da352fdf0e8f93be964ee945d`
- Sample `vote` tx hash (also mints rewards): `9cfbd2da7ad82b76c5427141bb9fbd1387ff5a5b916c242498ed03ed048992ad`

## Build

From the project root:

```bash
npm run contract:build
```

Or directly with Cargo:

```bash
cargo build --manifest-path poll_contract/Cargo.toml --target wasm32v1-none --release
```

## Deploy

From the project root:

```bash
npm run contract:deploy
```

The deploy script:

- funds a temporary deployer account on testnet when `STELLAR_DEPLOYER_SECRET` is not provided
- uploads the compiled contract WASM
- deploys the contract
- submits a sample `create_poll` contract call
- prints the contract id and transaction hashes as JSON

## Deployment Record

These values were generated on May 1, 2026 during testnet deployment:

- WASM upload tx: `ca5809303f6451e35dd520814e6e6b07e2aac951f0e9cf2618b3f8ef05b0960a`
- Contract deploy tx: `9528cd7a004a5fadaa0c9f3a0ae6c6e80d1a14805cfe61b916f5b40646700a5e`
- Sample create poll tx: `7e4cf4726ac994cfe672e2dbe12a85ce9f3cac0da352fdf0e8f93be964ee945d`
- Sample vote tx: `9cfbd2da7ad82b76c5427141bb9fbd1387ff5a5b916c242498ed03ed048992ad`
