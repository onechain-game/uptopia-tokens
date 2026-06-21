/**
 * Deploy script for the reusable TokenDistributor.
 *
 * Required environment variables:
 *   UP_TOKEN             - ERC-20 token address to distribute
 *   EARLY_BACKERS        - Beneficiary address for Early Backers allocation
 *   STRATEGIC_BACKERS    - Beneficiary address for Strategic Backers allocation
 *   PUBLIC_SALE          - Beneficiary address for Public Sale allocation
 *   ECOSYSTEM_GROWTH     - Beneficiary address for Ecosystem Growth allocation
 *   COMMUNITY_DEV        - Beneficiary address for Community Development allocation
 *   LIQUIDITY_PROVISION  - Beneficiary address for Liquidity Provision allocation
 *   FOUNDATION_RESERVE   - Beneficiary address for Foundation Reserve allocation
 *   CORE_CONTRIBUTORS    - Beneficiary address for Core Contributors allocation
 *   ADVISORS             - Beneficiary address for Advisors allocation
 *
 * Usage:
 *   UP_TOKEN=0x... EARLY_BACKERS=0x... ... npx hardhat run scripts/deploy-distributor.ts --network <network>
 *
 * NOTE: After deploying, transfer enough tokens to the distributor address before
 * beneficiaries claim. Call `startTGE()` when the vesting schedule should begin.
 */

import { formatEther, parseEther } from "ethers";
import { deployContract } from "./deployUtils.js";
import { requestConfirmation } from "./utils.js";

const THREE_MONTHS = 90 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TWO_YEARS = 730 * 24 * 60 * 60;

interface DeployConfig {
  token: string;
  earlyBackers: string;
  strategicBackers: string;
  publicSale: string;
  ecosystemGrowth: string;
  communityDev: string;
  liquidityProvision: string;
  foundationReserve: string;
  coreContributors: string;
  advisors: string;
}

function loadConfig(): DeployConfig {
  const cfg: DeployConfig = {
    token: process.env.UP_TOKEN || "",
    earlyBackers: process.env.EARLY_BACKERS || "",
    strategicBackers: process.env.STRATEGIC_BACKERS || "",
    publicSale: process.env.PUBLIC_SALE || "",
    ecosystemGrowth: process.env.ECOSYSTEM_GROWTH || "",
    communityDev: process.env.COMMUNITY_DEV || "",
    liquidityProvision: process.env.LIQUIDITY_PROVISION || "",
    foundationReserve: process.env.FOUNDATION_RESERVE || "",
    coreContributors: process.env.CORE_CONTRIBUTORS || "",
    advisors: process.env.ADVISORS || "",
  };

  for (const [key, val] of Object.entries(cfg)) {
    if (!val) throw new Error(`${key} env variable is required`);
  }

  return cfg;
}

function buildAllocations(c: DeployConfig) {
  return [
    [c.earlyBackers, parseEther("100000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("10000000"), false],
    [c.strategicBackers, parseEther("25000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("2500000"), false],
    [c.publicSale, parseEther("25000000"), parseEther("25000000"), 0, 0, 0, true],
    [c.ecosystemGrowth, parseEther("75000000"), parseEther("18750000"), SIX_MONTHS, THREE_MONTHS, parseEther("7500000"), false],
    [c.communityDev, parseEther("70000000"), parseEther("35000000"), SIX_MONTHS, THREE_MONTHS, parseEther("7000000"), false],
    [c.liquidityProvision, parseEther("30000000"), parseEther("30000000"), 0, 0, 0, true],
    [c.foundationReserve, parseEther("50000000"), 0n, ONE_YEAR, THREE_MONTHS, parseEther("5000000"), false],
    [c.coreContributors, parseEther("100000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("10000000"), false],
    [c.advisors, parseEther("25000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("2500000"), false],
  ];
}

const config = loadConfig();
const allocations = buildAllocations(config);

if (! await requestConfirmation(`
  You are about to deploy TokenDistributor.

  Token: ${config.token}
  Allocations:
  ${allocations.map(a => `  - ${a[0]}:
    + Total: ${formatEther(a[1].toString()).toLocaleString()} tokens
    + TGE: ${formatEther(a[2].toString()).toLocaleString()} tokens
    + Cliff: ${a[3]}s
    + Vesting: ${a[4]}s
    + Installment: ${formatEther(a[5].toString()).toLocaleString()} tokens
    + Instant: ${a[6]}`).join("\n")}

  After deployment, transfer 500,000,000 UP to the distributor before claims.
  Do you want to proceed? (y/n)
`)) {
  console.log("Deployment cancelled.");
  process.exit(0);
}

const distributor = await deployContract("TokenDistributor", [config.token, allocations], {
  label: "TokenDistributor",
});
const distributorAddress = await distributor.getAddress();

console.log("\n═══════════════════════════════════════════");
console.log("  Deployment complete!");
console.log(`  TokenDistributor : ${distributorAddress}`);
console.log(`  Token            : ${config.token}`);
console.log("  NOTE: Fund the distributor before claims.");
console.log("  NOTE: Call startTGE() when vesting should begin.");
console.log("═══════════════════════════════════════════\n");
