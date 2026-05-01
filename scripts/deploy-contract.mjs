import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk'
import { Spec } from '@stellar/stellar-sdk/contract'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rpcUrl = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org'
const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET
const pollWasmPath =
  process.env.STELLAR_POLL_WASM_PATH ||
  path.resolve(__dirname, '../poll_contract/target/wasm32v1-none/release/poll_contract.wasm')
const tokenWasmPath =
  process.env.STELLAR_TOKEN_WASM_PATH ||
  path.resolve(__dirname, '../token_contract/target/wasm32v1-none/release/reward_token_contract.wasm')

const server = new rpc.Server(rpcUrl)
const pollWasm = fs.readFileSync(pollWasmPath)
const tokenWasm = fs.readFileSync(tokenWasmPath)
const pollSpec = Spec.fromWasm(pollWasm)
const tokenSpec = Spec.fromWasm(tokenWasm)

function fail(message) {
  throw new Error(message)
}

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

async function getSourceKeypair() {
  const secret = process.env.STELLAR_DEPLOYER_SECRET
  if (secret) {
    return { keypair: Keypair.fromSecret(secret), generated: false }
  }

  const generated = Keypair.random()
  await server.fundAddress(generated.publicKey())
  return { keypair: generated, generated: true }
}

async function sendOperation(sourceKeypair, operation) {
  const account = await server.getAccount(sourceKeypair.publicKey())

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build()

  const prepared = await server.prepareTransaction(tx)
  prepared.sign(sourceKeypair)

  const submission = await server.sendTransaction(prepared)
  if (submission.status === 'ERROR' || submission.status === 'TRY_AGAIN_LATER') {
    fail(`Submission failed with status ${submission.status}.`)
  }

  const finalResult = await server.pollTransaction(submission.hash, {
    attempts: 40,
    sleepStrategy: () => 1500,
  })

  if (finalResult.status !== 'SUCCESS') {
    fail(`Network rejected the transaction with status ${finalResult.status}.`)
  }

  return {
    hash: submission.hash,
    returnValue: finalResult.returnValue,
  }
}

async function uploadContractWasm(sourceKeypair, wasm) {
  const result = await sendOperation(
    sourceKeypair,
    Operation.uploadContractWasm({ wasm }),
  )

  if (!result.returnValue) {
    fail('Upload succeeded but did not return a wasm hash.')
  }

  return {
    hash: result.hash,
    wasmHash: result.returnValue.bytes(),
  }
}

async function deployContract(sourceKeypair, wasmHash, saltHex) {
  const result = await sendOperation(
    sourceKeypair,
    Operation.createCustomContract({
      wasmHash,
      address: Address.fromString(sourceKeypair.publicKey()),
      salt: Buffer.from(saltHex, 'hex'),
    }),
  )

  if (!result.returnValue) {
    fail('Deploy succeeded but did not return a contract address.')
  }

  const contractId = StrKey.encodeContract(
    Address.fromScAddress(result.returnValue.address()).toBuffer(),
  )

  return {
    hash: result.hash,
    contractId,
  }
}

async function invokeContractCall({ sourceKeypair, contractId, spec, method, args }) {
  const account = await server.getAccount(sourceKeypair.publicKey())
  const contract = new Contract(contractId)
  const scArgs = spec.funcArgsToScVals(method, args)

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(60)
    .build()

  const prepared = await server.prepareTransaction(tx)
  prepared.sign(sourceKeypair)

  const submission = await server.sendTransaction(prepared)
  if (submission.status === 'ERROR' || submission.status === 'TRY_AGAIN_LATER') {
    fail(`Sample contract call failed with status ${submission.status}.`)
  }

  const finalResult = await server.pollTransaction(submission.hash, {
    attempts: 40,
    sleepStrategy: () => 1500,
  })

  if (finalResult.status !== 'SUCCESS') {
    fail(`Contract call ended with status ${finalResult.status}.`)
  }

  return submission.hash
}

async function main() {
  const { keypair, generated } = await getSourceKeypair()

  const pollUpload = await uploadContractWasm(keypair, pollWasm)
  const pollDeployment = await deployContract(keypair, pollUpload.wasmHash, pollUpload.hash)

  const tokenUpload = await uploadContractWasm(keypair, tokenWasm)
  const tokenDeployment = await deployContract(keypair, tokenUpload.wasmHash, tokenUpload.hash)

  const tokenInitTxHash = await invokeContractCall({
    sourceKeypair: keypair,
    contractId: tokenDeployment.contractId,
    spec: tokenSpec,
    method: 'initialize',
    args: {
      admin: pollDeployment.contractId,
      name: 'LivePoll Rewards',
      symbol: 'VOTE',
      decimals: 0,
    },
  })

  const rewardsConfigTxHash = await invokeContractCall({
    sourceKeypair: keypair,
    contractId: pollDeployment.contractId,
    spec: pollSpec,
    method: 'configure_rewards',
    args: {
      caller: keypair.publicKey(),
      token: tokenDeployment.contractId,
      amount: 10,
    },
  })

  const sampleCreatePollTxHash = await invokeContractCall({
    sourceKeypair: keypair,
    contractId: pollDeployment.contractId,
    spec: pollSpec,
    method: 'create_poll',
    args: {
      creator: keypair.publicKey(),
      question: 'Which feature should ship next?',
      options: ['Mobile support', 'Analytics dashboard', 'Theme presets'],
      duration_minutes: 120,
    },
  })

  const sampleVoteTxHash = await invokeContractCall({
    sourceKeypair: keypair,
    contractId: pollDeployment.contractId,
    spec: pollSpec,
    method: 'vote',
    args: {
      voter: keypair.publicKey(),
      poll_id: 1,
      option_index: 0,
    },
  })

  const output = {
    rpcUrl,
    networkPassphrase,
    deployerPublicKey: keypair.publicKey(),
    deployerSecret:
      process.env.PRINT_DEPLOYER_SECRET === '1'
        ? generated
          ? keypair.secret()
          : 'provided-via-env'
        : undefined,
    poll: {
      uploadTxHash: pollUpload.hash,
      wasmHash: toHex(pollUpload.wasmHash),
      deployTxHash: pollDeployment.hash,
      contractId: pollDeployment.contractId,
    },
    token: {
      uploadTxHash: tokenUpload.hash,
      wasmHash: toHex(tokenUpload.wasmHash),
      deployTxHash: tokenDeployment.hash,
      contractId: tokenDeployment.contractId,
      initTxHash: tokenInitTxHash,
    },
    rewardsConfigTxHash,
    sampleCreatePollTxHash,
    sampleVoteTxHash,
  }

  const sanitizedOutput = { ...output }
  delete sanitizedOutput.deployerSecret

  const deploymentsDir = path.resolve(__dirname, '../deployments')
  fs.mkdirSync(deploymentsDir, { recursive: true })
  fs.writeFileSync(
    path.join(deploymentsDir, 'testnet.latest.json'),
    `${JSON.stringify(sanitizedOutput, null, 2)}\n`,
    'utf8',
  )

  // Keep printing JSON for copy/paste into README or env files.
  console.log(JSON.stringify(sanitizedOutput, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
