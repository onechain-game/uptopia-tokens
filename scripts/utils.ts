import {network} from "hardhat";
import * as readline from 'readline';
import * as fs from "fs";
import * as path from "path";
import {
  ContractTransactionResponse,
  TransactionReceipt,
  TransactionResponse,
} from "ethers";
import { fileURLToPath } from "url";

const {ethers} = await network.connect();
type TxLike = TransactionResponse | ContractTransactionResponse;

export interface TxProcessOptions {
  /** Human-readable action label, e.g. "Set role" */
  label?: string;
  /** Number of confirmations to wait for. Defaults to 1. */
  confirmations?: number;
  /** Optional block explorer base URL override. */
  explorerBaseUrl?: string;
  /** Optional deployment environment suffix, same convention as deployUtils. */
  environment?: string;
  /** Caller address override for trace records. */
  caller?: string;
  /** Contract target override for trace records. */
  contractTarget?: string;
  /** Function name override for trace records. */
  functionName?: string;
  /** Function params override for trace records. */
  params?: unknown;
  /** Extra metadata persisted in trace record. */
  metadata?: Record<string, unknown>;
}

export interface TxTraceRecord {
  label: string;
  network: string;
  chainId: string;
  environment?: string;
  hash: string;
  caller: string;
  contractTarget: string;
  functionName: string;
  functionSelector: string;
  params: unknown;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TX_TRACE_DIR = path.join(__dirname, "..", "deployment", "tx-traces");
const TX_CONFIRM_DELAY_MS = 3_000;

function txTraceFilePath(networkName: string, environment?: string): string {
  const suffix = environment ? `_${environment}` : "";
  return path.join(TX_TRACE_DIR, `${networkName}${suffix}.json`);
}

function getEnvironment(environment?: string): string | undefined {
  if (environment && environment.trim().length > 0) return environment;
  const env = process.env.DEPLOY_ENV || process.env.ENVIRONMENT;
  if (!env || env.trim().length === 0) return undefined;
  return env;
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  return value;
}

export function loadTxTraces(networkName: string, environment?: string): TxTraceRecord[] {
  const file = txTraceFilePath(networkName, environment);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8")) as TxTraceRecord[];
}

export function saveTxTrace(networkName: string, trace: TxTraceRecord, environment?: string): void {
  fs.mkdirSync(TX_TRACE_DIR, { recursive: true });
  const file = txTraceFilePath(networkName, environment);
  const traces = loadTxTraces(networkName, environment);
  traces.push(trace);
  fs.writeFileSync(file, JSON.stringify(traces, null, 2), "utf-8");
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
    
}

async function loadTokenInfo(tokenAddress: string) {
  const token = await ethers.getContractAt("DummyERC20", tokenAddress);
  const name = await token.name();
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  const totalSupply = await token.totalSupply();
  return { name, symbol, decimals, totalSupply };
}

function requestConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
      rl.question(question, (answer) => {
          rl.close();
          const normalized = answer.trim().toLowerCase();
          resolve(normalized === 'y' || normalized === 'yes');
      });
  });
}

function getNetworkLabel(name: string, chainId: bigint): string {
  return name === "unknown" ? `chain-${chainId}` : name;
}

async function waitAndLogTx(
  tx: TxLike,
  options: TxProcessOptions = {}
): Promise<TransactionReceipt> {
  const {
    label = "Transaction",
    confirmations = 1,
    caller,
    contractTarget,
    functionName,
    params,
  } = options;

  const environment = getEnvironment(options.environment);
  const network = await ethers.provider.getNetwork();
  const networkLabel = getNetworkLabel(network.name, network.chainId);

  console.log(`\n[tx] ${label}`);
  console.log(`  network : ${networkLabel}`);
  console.log(`  chainId : ${network.chainId}`);
  if (environment) console.log(`  environment: ${environment}`);
  console.log(`  hash    : ${tx.hash}`);

  console.log(`  waiting : ${confirmations} confirmation(s)...`);
  const receipt = await tx.wait(confirmations);
  if (!receipt) {
    throw new Error(`Transaction receipt is null for tx ${tx.hash}`);
  }

  if (receipt.status !== 1) {
    throw new Error(`Transaction reverted: ${tx.hash}`);
  }

  console.log(`  settled : sleeping ${TX_CONFIRM_DELAY_MS / 1000}s after confirmation...`);
  await sleep(TX_CONFIRM_DELAY_MS);

  const derivedFunctionSelector = tx.data ? tx.data.slice(0, 10) : "0x";
  const finalCaller = caller ?? tx.from;
  const finalTarget = contractTarget ?? tx.to ?? "";
  const finalFunction = functionName ?? label;
  const finalParams = toJsonSafe(params ?? []);

  console.log(`  caller  : ${finalCaller}`);
  console.log(`  target  : ${finalTarget}`);
  console.log(`  function: ${finalFunction}`);
  console.log(`  selector: ${derivedFunctionSelector}`);
  console.log(`  params  : ${JSON.stringify(finalParams)}`);

  const trace: TxTraceRecord = {
    label,
    network: networkLabel,
    chainId: network.chainId.toString(),
    environment,
    hash: tx.hash,
    caller: finalCaller,
    contractTarget: finalTarget,
    functionName: finalFunction,
    functionSelector: derivedFunctionSelector,
    params: finalParams,
  };
  saveTxTrace(networkLabel, trace, environment);
  const traceFile = txTraceFilePath(networkLabel, environment);
  console.log(`  trace   : ${traceFile}`);

  return receipt;
}

async function sendAndLogTx(
  label: string,
  txPromise: Promise<TxLike>,
  options: Omit<TxProcessOptions, "label"> = {}
): Promise<TransactionReceipt> {
  const tx = await txPromise;
  return waitAndLogTx(tx, { ...options, label });
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

function parseTime(day = 0, month= 0, year=0, hour = 0, minute = 0, second = 0, gmt = 7) {
  const date = new Date(Date.UTC(year, month - 1, day, hour - gmt, minute, second));
  return Math.floor(date.getTime() / 1000);
}

export {
  sleep,
  loadTokenInfo,
  requestConfirmation,
  formatTimestamp,
  parseTime,
  waitAndLogTx,
  sendAndLogTx,
};