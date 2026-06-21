/**
 * Deploy script for the UP token.
 *
 * Required environment variables:
 *   UP_RECEIVER - Address that receives the full 500M UP supply
 *
 * Usage:
 *   UP_RECEIVER=0x... npx hardhat run scripts/deploy.ts --network <network>
 */

import { deployContract } from "./deployUtils.js";
import { requestConfirmation } from "./utils.js";

function loadReceiver(): string {
  const receiver = process.env.UP_RECEIVER || "";
  if (!receiver) throw new Error("UP_RECEIVER env variable is required");
  return receiver;
}

const receiver = loadReceiver();

if (! await requestConfirmation(`
  You are about to deploy the UP token.

  Full supply receiver: ${receiver}
  Total supply        : 500,000,000 UP

  Do you want to proceed? (y/n)
`)) {
  console.log("Deployment cancelled.");
  process.exit(0);
}

const up = await deployContract("Up", [receiver], { label: "Up" });
const upAddress = await up.getAddress();

console.log("\n═══════════════════════════════════════════");
console.log("  Deployment complete!");
console.log(`  UP Token : ${upAddress}`);
console.log(`  Receiver : ${receiver}`);
console.log("═══════════════════════════════════════════\n");
