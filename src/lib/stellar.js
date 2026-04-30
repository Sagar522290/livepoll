import { Buffer } from 'buffer'
import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk'
import { Spec } from '@stellar/stellar-sdk/contract'

const pollContractWasmUrl =
  import.meta.env.VITE_POLL_CONTRACT_WASM_URL ||
  `${import.meta.env.BASE_URL}contracts/poll_contract.wasm`

const rewardTokenWasmUrl =
  import.meta.env.VITE_REWARD_TOKEN_WASM_URL ||
  `${import.meta.env.BASE_URL}contracts/reward_token_contract.wasm`

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer
}

const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org'
const DEFAULT_CONTRACT_ID = 'CBGJGJOFFSY5KK7DHFENNBGASXROVG5GEW2MISGJ2N2F7VLHCCUJ42UA'
const READ_ACCOUNT_STORAGE_KEY = 'livepoll_read_account'

export const RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL || DEFAULT_RPC_URL
export const NETWORK_PASSPHRASE =
  import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET
export const CONTRACT_ID = import.meta.env.VITE_STELLAR_CONTRACT_ID || DEFAULT_CONTRACT_ID
export const REWARD_TOKEN_CONTRACT_ID = import.meta.env.VITE_REWARD_TOKEN_CONTRACT_ID || ''
export const EXPLORER_BASE_URL =
  import.meta.env.VITE_STELLAR_EXPLORER_URL || 'https://stellar.expert/explorer/testnet'

export const SUPPORTED_WALLET_NAMES = [
  'xBull',
  'Freighter',
  'Albedo',
  'Rabet',
  'Lobstr',
  'Hana',
  'Hot Wallet',
  'Klever',
]

export const server = new rpc.Server(RPC_URL)

const specCache = new Map()
let walletRuntimePromise = null

async function getWalletRuntime() {
  if (walletRuntimePromise) {
    return walletRuntimePromise
  }

  walletRuntimePromise = import('@creit.tech/stellar-wallets-kit').then(
    ({ StellarWalletsKit, WalletNetwork, allowAllModules, FREIGHTER_ID }) => ({
      walletKit: new StellarWalletsKit({
        network: WalletNetwork.TESTNET,
        modules: allowAllModules(),
      }),
      FREIGHTER_ID,
    }),
  )

  return walletRuntimePromise
}

function ensureContractConfigured() {
  if (!CONTRACT_ID) {
    throw new Error(
      'Missing VITE_STELLAR_CONTRACT_ID. Add your deployed testnet contract id to the frontend env.',
    )
  }
}

function toDisplayString(value) {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value?.toString === 'function') {
    return value.toString()
  }

  return String(value)
}

function toNumber(value) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  return Number(value || 0)
}

function normalizeContractEvent(event) {
  const topic = (event.topic || []).map((item) => scValToNative(item))
  const value = event.value ? scValToNative(event.value) : null
  const namespace = toDisplayString(topic[0]).toLowerCase()
  const action = toDisplayString(topic[1]).toLowerCase()
  const pollId = namespace === 'poll' ? toNumber(topic[2]) : null
  const actor = topic.length >= 4 ? toDisplayString(topic[3]) : ''

  let title = 'Contract update detected'
  let summary = 'A contract update was detected on-chain.'

  if (namespace === 'poll' && action === 'create') {
    title = 'Poll created'
    summary = `Poll #${pollId} was created on-chain.`
  }

  if (namespace === 'poll' && action === 'vote') {
    title = 'Vote received'
    summary = `Poll #${pollId} recorded a vote for option ${toNumber(value) + 1}${actor ? ` by ${actor}` : ''}.`
  }

  if (namespace === 'poll' && action === 'close') {
    title = 'Poll closed'
    summary = `Poll #${pollId} was closed on-chain.`
  }

  if (namespace === 'poll' && action === 'delete') {
    title = 'Poll deleted'
    summary = `Poll #${pollId} was deleted on-chain.`
  }

  if (namespace === 'poll' && action === 'reward') {
    title = 'Vote reward minted'
    summary = 'A reward was minted after a vote.'
  }

  if (namespace === 'token' && action === 'mint') {
    title = 'Reward minted'
    summary = `Minted ${toDisplayString(value)} tokens to ${toDisplayString(topic[2])}.`
  }

  if (namespace === 'token' && action === 'transfer') {
    title = 'Reward token transfer'
    summary = `Transferred ${toDisplayString(value)} tokens.`
  }

  return {
    id: event.id,
    action,
    namespace,
    pollId: pollId == null ? undefined : pollId,
    title,
    summary,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    txHash: event.txHash,
  }
}

export function getExplorerLink(type, value) {
  return `${EXPLORER_BASE_URL}/${type}/${value}`
}

async function getSpec(wasmUrl, errorMessage) {
  if (specCache.has(wasmUrl)) {
    return specCache.get(wasmUrl)
  }

  const promise = fetch(wasmUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(errorMessage)
      }

      return response.arrayBuffer()
    })
    .then((buffer) => Spec.fromWasm(Buffer.from(buffer)))

  specCache.set(wasmUrl, promise)
  return promise
}

export async function getContractSpec() {
  return getSpec(pollContractWasmUrl, 'Unable to load the compiled poll contract wasm.')
}

export async function getRewardTokenSpec() {
  return getSpec(
    rewardTokenWasmUrl,
    'Unable to load the compiled reward token contract wasm.',
  )
}

export async function ensureReadAccount() {
  const configuredAddress = import.meta.env.VITE_STELLAR_READ_ACCOUNT
  if (configuredAddress) {
    return configuredAddress
  }

  const storedAddress = window.localStorage.getItem(READ_ACCOUNT_STORAGE_KEY)
  if (storedAddress) {
    try {
      await server.getAccount(storedAddress)
      return storedAddress
    } catch {
      window.localStorage.removeItem(READ_ACCOUNT_STORAGE_KEY)
    }
  }

  const keypair = Keypair.random()
  await server.fundAddress(keypair.publicKey())
  window.localStorage.setItem(READ_ACCOUNT_STORAGE_KEY, keypair.publicKey())
  return keypair.publicKey()
}

async function buildInvocation({ sourceAddress, contractId, spec, method, args = {} }) {
  const account = await server.getAccount(sourceAddress)
  const contract = new Contract(contractId)
  const scArgs = spec.funcArgsToScVals(method, args)

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(60)
    .build()

  return { spec, tx }
}

function extractSimulationError(simulation) {
  if (rpc.Api.isSimulationError(simulation)) {
    return simulation.error
  }

  return 'Transaction simulation failed.'
}

function extractSubmissionError(reply) {
  if (!reply) {
    return 'The transaction could not be submitted.'
  }

  if (typeof reply === 'string') {
    return reply
  }

  if (reply.errorResult?.switch) {
    return `Submission failed: ${reply.errorResult.switch().name}.`
  }

  if (reply.status) {
    return `Submission failed with status ${reply.status}.`
  }

  return reply.message || 'The transaction could not be submitted.'
}

function extractPolledFailure(reply) {
  if (!reply) {
    return 'The network did not confirm the transaction.'
  }

  if (reply.status === 'NOT_FOUND') {
    return 'The transaction was submitted but was not found before polling timed out.'
  }

  if (reply.resultXdr?.result?.()?.switch) {
    return `Transaction failed: ${reply.resultXdr.result().switch().name}.`
  }

  return 'The network rejected the transaction.'
}

export async function callContractRead(method, args = {}, sourceAddress) {
  ensureContractConfigured()
  const readAddress = sourceAddress || (await ensureReadAccount())
  const spec = await getContractSpec()
  const { tx } = await buildInvocation({
    sourceAddress: readAddress,
    contractId: CONTRACT_ID,
    spec,
    method,
    args,
  })
  const simulation = await server.simulateTransaction(tx)

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(extractSimulationError(simulation))
  }

  const result = simulation.result?.retval
  if (!result) {
    return null
  }

  return spec.funcResToNative(method, result)
}

export async function callRewardTokenRead(method, args = {}, sourceAddress, tokenContractId) {
  const resolvedContractId = toDisplayString(tokenContractId || REWARD_TOKEN_CONTRACT_ID)
  if (!resolvedContractId) {
    throw new Error('Missing reward token contract id.')
  }

  const readAddress = sourceAddress || (await ensureReadAccount())
  const spec = await getRewardTokenSpec()
  const { tx } = await buildInvocation({
    sourceAddress: readAddress,
    contractId: resolvedContractId,
    spec,
    method,
    args,
  })

  const simulation = await server.simulateTransaction(tx)

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(extractSimulationError(simulation))
  }

  const result = simulation.result?.retval
  if (!result) {
    return null
  }

  return spec.funcResToNative(method, result)
}

export function normalizePoll(contractPoll) {
  return {
    id: toNumber(contractPoll.id),
    question: toDisplayString(contractPoll.question),
    options: (contractPoll.options || []).map((option) => toDisplayString(option)),
    votes: (contractPoll.votes || []).map((vote) => toNumber(vote)),
    createdAt: toNumber(contractPoll.created_at) * 1000,
    expiresAt: toNumber(contractPoll.expires_at) * 1000,
    creator: toDisplayString(contractPoll.creator),
    active: Boolean(contractPoll.active),
  }
}

export async function fetchPolls(sourceAddress) {
  const rawPolls = await callContractRead('get_polls', {}, sourceAddress)
  return (rawPolls || []).map(normalizePoll)
}

export async function fetchRewardConfig(sourceAddress) {
  return callContractRead('get_reward_config', {}, sourceAddress)
}

export async function fetchRewardTokenMetadata(sourceAddress) {
  const resolvedContractId = toDisplayString(REWARD_TOKEN_CONTRACT_ID)
  if (!resolvedContractId) {
    return null
  }

  return callRewardTokenRead('metadata', {}, sourceAddress, resolvedContractId)
}

export async function fetchRewardTokenMetadataForContract(tokenContractId, sourceAddress) {
  const resolvedContractId = toDisplayString(tokenContractId)
  if (!resolvedContractId) {
    return null
  }

  return callRewardTokenRead('metadata', {}, sourceAddress, resolvedContractId)
}

export async function fetchRewardTokenBalance(walletAddress, sourceAddress) {
  const resolvedContractId = toDisplayString(REWARD_TOKEN_CONTRACT_ID)
  if (!resolvedContractId || !walletAddress) {
    return null
  }

  return callRewardTokenRead('balance', { id: walletAddress }, sourceAddress, resolvedContractId)
}

export async function fetchRewardTokenBalanceForContract(tokenContractId, walletAddress, sourceAddress) {
  const resolvedContractId = toDisplayString(tokenContractId)
  if (!resolvedContractId || !walletAddress) {
    return null
  }

  return callRewardTokenRead('balance', { id: walletAddress }, sourceAddress, resolvedContractId)
}

export async function fetchVoteStatuses(polls, voterAddress, sourceAddress) {
  if (!voterAddress || polls.length === 0) {
    return {}
  }

  const pollIds = polls.map((poll) => poll.id)

  try {
    const flags = await callContractRead(
      'has_voted_many',
      { poll_ids: pollIds, voter: voterAddress },
      sourceAddress,
    )

    if (Array.isArray(flags) && flags.length === pollIds.length) {
      return Object.fromEntries(pollIds.map((pollId, index) => [pollId, Boolean(flags[index])]))
    }
  } catch {
    // Fall back to per-poll reads for older deployments.
  }

  const voteEntries = await Promise.all(
    polls.map(async (poll) => {
      const hasVoted = await callContractRead(
        'has_voted',
        { poll_id: poll.id, voter: voterAddress },
        sourceAddress,
      )

      return [poll.id, Boolean(hasVoted)]
    }),
  )

  return Object.fromEntries(voteEntries)
}

export async function fetchContractEvents(cursor, contractIdsOverride) {
  ensureContractConfigured()

  const contractIds = (
    Array.isArray(contractIdsOverride) && contractIdsOverride.length > 0
      ? contractIdsOverride
      : [CONTRACT_ID, REWARD_TOKEN_CONTRACT_ID]
  )
    .map((contractId) => toDisplayString(contractId))
    .filter(Boolean)

  const uniqueContractIds = Array.from(new Set(contractIds))
  const filters = [{ type: 'contract', contractIds }]
  filters[0].contractIds = uniqueContractIds

  if (cursor) {
    const response = await server.getEvents({ filters, cursor, limit: 20 })

    return {
      ...response,
      events: response.events.map(normalizeContractEvent),
    }
  }

  const latestLedger = await server.getLatestLedger()
  const startLedger = Math.max(latestLedger.sequence - 2, 1)
  const response = await server.getEvents({ filters, startLedger, limit: 20 })

  return {
    ...response,
    events: response.events.map(normalizeContractEvent),
  }
}

export async function connectWallet() {
  const { walletKit, FREIGHTER_ID } = await getWalletRuntime()

  return new Promise((resolve, reject) => {
    walletKit
      .openModal({
        modalTitle: 'Choose a Stellar wallet',
        notAvailableText: 'Install a Stellar wallet to create and vote on-chain.',
        onWalletSelected: async (walletOption) => {
          try {
            walletKit.setWallet(walletOption.id)
            let address = ''

            if (walletOption.id === FREIGHTER_ID) {
              const { requestAccess: requestFreighterAccess, getAddress: getFreighterAddress } =
                await import('@stellar/freighter-api')

              const accessResponse = await requestFreighterAccess()
              if (accessResponse.error) {
                throw accessResponse.error
              }

              address = accessResponse.address

              if (!address) {
                const freighterAddressResponse = await getFreighterAddress()
                if (freighterAddressResponse.error) {
                  throw freighterAddressResponse.error
                }

                address = freighterAddressResponse.address
              }
            } else {
              const response = await walletKit.getAddress()
              address = response.address
            }

            if (!address) {
              throw new Error('The selected wallet did not return a public address.')
            }

            resolve({
              address,
              walletId: walletOption.id,
              walletName: walletOption.name || walletOption.productName || 'Wallet',
            })
          } catch (error) {
            reject(error)
          }
        },
        onClosed: (error) => {
          reject(error || new Error('The wallet request was closed before finishing.'))
        },
      })
      .catch(reject)
  })
}

export async function disconnectWallet() {
  const { walletKit } = await getWalletRuntime()

  try {
    await walletKit.disconnect?.()
  } catch {
    // Best effort only. Some wallet modules do not expose disconnect behavior.
  }
}

export async function submitContractTransaction({
  method,
  args,
  address,
  onStatus,
}) {
  const { walletKit } = await getWalletRuntime()

  ensureContractConfigured()
  const spec = await getContractSpec()
  const { tx } = await buildInvocation({
    sourceAddress: address,
    contractId: CONTRACT_ID,
    spec,
    method,
    args,
  })
  onStatus?.({ phase: 'preparing' })

  const prepared = await server.prepareTransaction(tx)
  onStatus?.({ phase: 'awaiting-signature' })

  const { signedTxXdr } = await walletKit.signTransaction(prepared.toXDR(), {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  })

  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE)
  const submission = await server.sendTransaction(signedTx)

  if (submission.status === 'ERROR' || submission.status === 'TRY_AGAIN_LATER') {
    throw new Error(extractSubmissionError(submission))
  }

  onStatus?.({
    phase: 'pending',
    hash: submission.hash,
    latestLedger: submission.latestLedger,
  })

  const finalResult = await server.pollTransaction(submission.hash, {
    attempts: 40,
    sleepStrategy: () => 1500,
  })

  if (finalResult.status !== 'SUCCESS') {
    throw new Error(extractPolledFailure(finalResult))
  }

  onStatus?.({
    phase: 'success',
    hash: submission.hash,
    ledger: finalResult.ledger,
  })

  return finalResult
}
