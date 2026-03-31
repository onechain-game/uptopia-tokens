/**
 * deployUtils.ts
 *
 * Shared helpers for Hardhat deployment scripts.
 *
 * Features:
 *  - deployContract   – deploy a plain contract, record address, verify
 *  - deployWithProxy  – deploy impl + UptopiaProxy, record both
 *  - saveDeployment   – persist an address entry to deployment/{network}.json
 *  - loadDeployments  – read the current deployment file for a network
 *
 * JSON format  (deployment/{network}.json):
 *  {
 *    "ContractName":                "0x...",   // proxy address (or plain address)
 *    "ContractName_Implementation": "0x..."    // impl address (proxy only)
 *  }
 */

import {network, tasks} from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { BaseContract, ContractFactory } from "ethers";

const { ethers} = await network.connect();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeployRecord {
  [label: string]: string;
}

export interface DeployOptions {
  /** Key used in the JSON file. Defaults to the contract name. */
  label?: string;
  /**
   * Whether to skip Etherscan verification.
   * Verification is always skipped on chainId 31337 (local hardhat).
   */
  skipVerify?: boolean;
  /**
   * Optional deployment environment suffix.
   * - Omitted / empty string → deployment/{networkName}.json  (default / testnet)
   * - Set to "staging"       → deployment/{networkName}_staging.json
   * - Set to "production"    → deployment/{networkName}_production.json
   */
  environment?: string;
}

export interface ProxyDeployOptions extends DeployOptions {
  /**
   * Address of an existing ProxyAdmin to reuse.
   * If omitted a new ProxyAdmin is deployed.
   */
  proxyAdminAddress?: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOYMENT_DIR = path.join(__dirname, "..", "deployment");
const DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve the deployment file path for the active network. */
function deploymentFilePath(networkName: string, environment?: string): string {
  const suffix = environment ? `_${environment}` : "";
  return path.join(DEPLOYMENT_DIR, `${networkName}${suffix}.json`);
}

/** Read the deployment file (returns {} if it does not exist). */
export function loadDeployments(networkName: string, environment?: string): DeployRecord {
  const file = deploymentFilePath(networkName, environment);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8")) as DeployRecord;
}

/** Persist a single key→address entry, overwriting any previous value. */
export function saveDeployment(
  networkName: string,
  label: string,
  address: string,
  environment?: string
): void {
  fs.mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  const file = deploymentFilePath(networkName, environment);
  const current = loadDeployments(networkName, environment);
  current[label] = address;
  fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf-8");
}

/** Attempt Etherscan verification, suppressing "already verified" errors. */
async function verify(
  address: string,
  constructorArguments: unknown[]
): Promise<void> {
  try {
    await tasks.getTask("verify:verify").run({ address, constructorArguments });
    console.log(`  ✓ Verified ${address}`);
  } catch (err: any) {
    if (
      err?.message?.toLowerCase().includes("already verified") ||
      err?.message?.toLowerCase().includes("already been verified")
    ) {
      console.log(`  ✓ Already verified ${address}`);
    } else {
      console.warn(`  ⚠ Verification failed: ${err?.message ?? err}`);
    }
  }
}

// ─── deployContract ───────────────────────────────────────────────────────────

/**
 * Deploy a plain (non-proxied) contract.
 *
 * @param contractName   Hardhat artifact name (e.g. "MoonDust")
 * @param constructorArgs  Arguments forwarded to the constructor
 * @param options        { label?, skipVerify? }
 * @returns              The deployed contract instance
 *
 * @example
 *   const token = await deployContract("MoonDust", [owner], { label: "MoonDust" });
 */
export async function deployContract<T extends BaseContract>(
  contractName: string,
  constructorArgs: unknown[] = [],
  options: DeployOptions = {}
): Promise<T> {
  const { label = contractName, skipVerify = false, environment } = options;
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;
  const isLocal = network.chainId === 31337n;

  const deploymentKey = environment ? `${networkName}_${environment}` : networkName;

  console.log(`\n[deploy] ${contractName} → label: "${label}"`);
  console.log(`  network : ${networkName} (chainId: ${network.chainId})`);
  if (environment) console.log(`  env     : ${environment}`);

  const factory: ContractFactory = await ethers.getContractFactory(contractName);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`  address : ${address}`);

  // Wait for confirmations to propagate
  console.log(`  waiting ${DELAY_MS / 1000}s for tx propagation…`);
  await sleep(DELAY_MS);

  // Persist
  saveDeployment(networkName, label, address, environment);
  console.log(`  saved   : deployment/${deploymentKey}.json ["${label}"]`);

  // Verify
  if (!isLocal && !skipVerify) {
    console.log(`  verifying on Etherscan…`);
    await verify(address, constructorArgs);
  }

  return contract as unknown as T;
}

// ─── deployWithProxy ──────────────────────────────────────────────────────────

/**
 * Deploy an implementation contract then wrap it in an
 * UptopiaProxy.  Saves two keys to the deployment JSON:
 *   - `<label>`                → proxy address
 *   - `<label>_Implementation` → implementation address
 *
 * @param contractName       Hardhat artifact name of the implementation
 * @param constructorArgs    Implementation constructor arguments (usually [])
 * @param initializerData    Encoded initializer calldata (use encodeInitData helper)
 * @param options            { label?, skipVerify?, adminAddress? }
 * @returns                  The contract instance attached to the proxy address
 *
 * @example
 *   const initData = encodeInitData("MyContract", ["initialize", [arg1, arg2]]);
 *   const proxy = await deployWithProxy("MyContract", [], initData);
 */
export async function deployWithProxy<T extends BaseContract>(
  contractName: string,
  constructorArgs: unknown[] = [],
  initializerData: string = "0x",
  options: ProxyDeployOptions = {}
): Promise<T> {
  const {
    label = contractName,
    skipVerify = false,
    proxyAdminAddress,
    environment,
  } = options;

  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? `chain-${network.chainId}` : network.name;
  const isLocal = network.chainId === 31337n;
  const [deployer] = await ethers.getSigners();

  const deploymentKey = environment ? `${networkName}_${environment}` : networkName;

  console.log(`\n[deploy-proxy] ${contractName} → label: "${label}"`);
  console.log(`  network : ${networkName} (chainId: ${network.chainId})`);
  if (environment) console.log(`  env     : ${environment}`);

  // 1. Deploy implementation ──────────────────────────────────────────────────
  console.log(`  [1/2] deploying implementation…`);
  const implFactory: ContractFactory = await ethers.getContractFactory(contractName);
  const impl = await implFactory.deploy(...constructorArgs);
  await impl.waitForDeployment();
  const implAddress = await impl.getAddress();
  console.log(`        impl    : ${implAddress}`);
  await sleep(DELAY_MS);

  // 2. Deploy (or reuse) ProxyAdmin ─────────────────────────────────────────
  let adminAddress: string;
  if (proxyAdminAddress) {
    adminAddress = proxyAdminAddress;
    console.log(`  [2/3] reusing ProxyAdmin : ${adminAddress}`);
  } else {
    console.log(`  [2/3] deploying ProxyAdmin…`);
    const adminFactory: ContractFactory = await ethers.getContractFactory("ProxyAdmin");
    const admin = await adminFactory.deploy(deployer.address);
    await admin.waitForDeployment();
    adminAddress = await admin.getAddress();
    console.log(`        ProxyAdmin : ${adminAddress}`);
    await sleep(DELAY_MS);
    saveDeployment(networkName, `${label}_ProxyAdmin`, adminAddress, environment);

    if (!isLocal && !skipVerify) {
      await verify(adminAddress, [deployer.address]);
    }
  }

  // 3. Deploy UptopiaProxy ────────────────────────────────────────────────────
  console.log(`  [3/3] deploying UptopiaProxy…`);
  const proxyFactory: ContractFactory = await ethers.getContractFactory(
    "UptopiaProxy"
  );
  const proxy = await proxyFactory.deploy(implAddress, adminAddress, initializerData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log(`        proxy   : ${proxyAddress}`);
  await sleep(DELAY_MS);

  // Persist all three addresses
  saveDeployment(networkName, label, proxyAddress, environment);
  saveDeployment(networkName, `${label}_Implementation`, implAddress, environment);
  console.log(`  saved   : deployment/${deploymentKey}.json ["${label}", "${label}_Implementation"]`);

  // Verify implementation (proxy itself is usually auto-verified)
  if (!isLocal && !skipVerify) {
    console.log(`  verifying implementation…`);
    await verify(implAddress, constructorArgs);
    console.log(`  verifying proxy…`);
    await verify(proxyAddress, [implAddress, adminAddress, initializerData]);
  }

  // Return an instance of the implementation ABI attached to the proxy address
  return (await ethers.getContractAt(contractName, proxyAddress)) as unknown as T;
}

// ─── encodeInitData ───────────────────────────────────────────────────────────

/**
 * Helper to encode an initializer call (for use with deployWithProxy).
 *
 * @param contractName     Hardhat artifact name whose ABI contains the function
 * @param functionName     Name of the initializer function (e.g. "initialize")
 * @param args             Arguments to pass to the initializer
 *
 * @example
 *   const data = await encodeInitData("ClaimPoint", "initialize", [token, rate]);
 */
export async function encodeInitData(
  contractName: string,
  functionName: string,
  args: unknown[] = []
): Promise<string> {
  const factory = await ethers.getContractFactory(contractName);
  return factory.interface.encodeFunctionData(functionName, args);
}
