# LivePoll

LivePoll is a Stellar Level 2 polling dapp with multi-wallet support, a deployed Soroban smart contract on Stellar testnet, and real-time event-driven UI updates.

## Overview

This project covers the Level 2 requirements for:

- multi-wallet integration with `StellarWalletsKit`
- wallet error handling
- deployed Soroban contract usage from the frontend
- contract reads and writes
- real-time event synchronization
- visible transaction status tracking

## Features

- Connect with multiple Stellar wallets including Freighter, xBull, Albedo, Rabet, Lobstr, Hana, Hot Wallet, and Klever
- Create polls, vote, and close polls through contract calls from the frontend
- Read contract state in read-only mode when no wallet is connected
- Track transaction phases: preparing, awaiting-signature, pending, success, and error
- Sync UI state from testnet contract events
- Handle wallet errors including wallet not found, request rejected, and insufficient balance

## Screenshot

Wallet options available:

![Wallet options preview](./public/wallet-options-preview.svg)

## Deployed Contract

- Network: `Stellar Testnet`
- Contract address: `CBGJGJOFFSY5KK7DHFENNBGASXROVG5GEW2MISGJ2N2F7VLHCCUJ42UA`
- Contract explorer: https://stellar.expert/explorer/testnet/contract/CBGJGJOFFSY5KK7DHFENNBGASXROVG5GEW2MISGJ2N2F7VLHCCUJ42UA

## Verifiable Contract Call

- Transaction hash: `282d8793c1968e02b32d6d23d688b930a01c316056c908acfd6b685b8089f67e`
- Stellar Expert link: https://stellar.expert/explorer/testnet/tx/282d8793c1968e02b32d6d23d688b930a01c316056c908acfd6b685b8089f67e

## Live Demo

- Optional: add your deployed Vercel, Netlify, or similar link here before submission

## Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Build the Soroban contract:

```bash
npm run contract:build
```

3. Optionally create a local env file:

```powershell
Copy-Item .env.example .env.local
```

4. Start the frontend:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
```

## Environment Variables

```env
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_STELLAR_CONTRACT_ID=CBGJGJOFFSY5KK7DHFENNBGASXROVG5GEW2MISGJ2N2F7VLHCCUJ42UA
VITE_STELLAR_READ_ACCOUNT=
VITE_STELLAR_EXPLORER_URL=https://stellar.expert/explorer/testnet
```

## Scripts

- `npm run dev` starts the frontend
- `npm run build` creates a production build
- `npm run lint` runs ESLint
- `npm run contract:build` builds the Soroban contract
- `npm run contract:deploy` uploads and deploys the contract to testnet

## Project Structure

- `src/` contains the React frontend
- `src/lib/stellar.js` contains wallet, RPC, contract, and event helpers
- `poll_contract/` contains the Soroban contract
- `scripts/` contains deployment helpers

## Additional Docs

- Frontend guide: [FRONTEND.md](./FRONTEND.md)
- Contract guide: [poll_contract/README.md](./poll_contract/README.md)

## Submission Notes

- Public GitHub repository: `https://github.com/Sagar522290/livepoll.git`
- Meaningful commits are present in git history
- Contract is deployed on testnet and called from the frontend
- Real-time event integration and visible transaction status are implemented
