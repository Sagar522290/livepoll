# Reward Token Contract

## Overview

This folder contains a simple Soroban token contract used by LivePoll as a vote reward token.

The poll contract can mint tokens to voters via an **inter-contract call**, which demonstrates a
production-relevant pattern for composing contracts.

## Network Details

- Network: `Stellar Testnet`
- Contract address: `CAYH4VFCCZTBFQZGDTDUSRNXTUNR33RLQKRVQZTDYSUZBXVATFE4HREQ`
- Contract explorer: https://stellar.expert/explorer/testnet/contract/CAYH4VFCCZTBFQZGDTDUSRNXTUNR33RLQKRVQZTDYSUZBXVATFE4HREQ
- Initialize tx hash: `8985c77edf3cda881f59e24319b208d985e8efd874fb87c7f7c9ea733dc04824`

## Build

From the project root:

```bash
npm run token:build
```

Or directly with Cargo:

```bash
cargo build --manifest-path token_contract/Cargo.toml --target wasm32v1-none --release
```

## Deploy

From the project root:

```bash
npm run contracts:deploy
```

The deploy script uploads and deploys:

- `poll_contract`
- `token_contract`

It then configures the poll contract to mint rewards on vote.
