/**
 * Deploy script for Up token with built-in vesting.
 *
 * Required environment variables:
 *   EARLY_BACKERS       – Beneficiary address for Early Backers allocation
 *   STRATEGIC_BACKERS   – Beneficiary address for Strategic Backers allocation
 *   PUBLIC_SALE         – Beneficiary address for Public Sale allocation
 *   ECOSYSTEM_GROWTH    – Beneficiary address for Ecosystem Growth allocation
 *   COMMUNITY_DEV       – Beneficiary address for Community Development allocation
 *   LIQUIDITY_PROVISION – Beneficiary address for Liquidity Provision allocation
 *   FOUNDATION_RESERVE  – Beneficiary address for Foundation Reserve allocation
 *   CORE_CONTRIBUTORS   – Beneficiary address for Core Contributors allocation
 *   ADVISORS            – Beneficiary address for Advisors allocation
 *
 * Usage:
 *   EARLY_BACKERS=0x... ... npx hardhat run scripts/deploy.ts --network <network>
 *
 * NOTE: After deploying and adding liquidity, call `startTGE()` on the
 * contract to activate the Token Generation Event. Public Sale and Liquidity
 * Provision tokens are transferred immediately at deployment.
 */

import { formatEther, parseEther } from "ethers";
import { deployContract } from "./deployUtils.js";
import { requestConfirmation } from "./utils.js";

// ─── Time constants (seconds) ────────────────────────────────────────────────

const THREE_MONTHS = 90 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TWO_YEARS = 730 * 24 * 60 * 60;

// ─── Configuration ───────────────────────────────────────────────────────────

interface DeployConfig {
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
    // Early Backers – 100M, TGE 0%, 6 mo cliff, 10% / 3 mo
    [c.earlyBackers, parseEther("100000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("10000000"), false],
    // Strategic Backers – 25M, TGE 0%, 6 mo cliff, 10% / 3 mo
    [c.strategicBackers, parseEther("25000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("2500000"), false],
    // Public Sale – 25M, instant release
    [c.publicSale, parseEther("25000000"), parseEther("25000000"), 0, 0, 0, true],
    // Ecosystem Growth – 75M, TGE 25%, 6 mo cliff, 10% / 3 mo
    [c.ecosystemGrowth, parseEther("75000000"), parseEther("18750000"), SIX_MONTHS, THREE_MONTHS, parseEther("7500000"), false],
    // Community Development – 70M, TGE 50%, 6 mo cliff, 10% / 3 mo
    [c.communityDev, parseEther("70000000"), parseEther("35000000"), SIX_MONTHS, THREE_MONTHS, parseEther("7000000"), false],
    // Liquidity Provision – 30M, instant release
    [c.liquidityProvision, parseEther("30000000"), parseEther("30000000"), 0, 0, 0, true],
    // Foundation Reserve – 50M, TGE 0%, 1 yr cliff, 10% / 3 mo
    [c.foundationReserve, parseEther("50000000"), 0n, ONE_YEAR, THREE_MONTHS, parseEther("5000000"), false],
    // Core Contributors – 100M, TGE 0%, 2 yr cliff, 10% / 3 mo
    [c.coreContributors, parseEther("100000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("10000000"), false],
    // Advisors – 25M, TGE 0%, 2 yr cliff, 10% / 3 mo
    [c.advisors, parseEther("25000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("2500000"), false],
  ];
}

// ─── Main deployment ─────────────────────────────────────────────────────────

const config = loadConfig();
const allocations = buildAllocations(config);

if (! await requestConfirmation(`
  You are about to deploy the UP token with the following allocations:
  ${allocations.map(a => `  - ${a[0]}: 
    + Total: ${formatEther(a[1].toString()).toLocaleString()} UP
    + TGE: ${formatEther(a[2].toString()).toLocaleString()} UP
    + Cliff: ${a[3]}s
    + Vesting: ${a[4]}s
    + Installment: ${formatEther(a[5].toString()).toLocaleString()} UP
    + Immediate: ${a[6]}`).join("\n")}

  Do you want to proceed? (y/n)
`)) {
  console.log("Deployment cancelled.");
  process.exit(0);
}

const up = await deployContract("Up", [allocations], { label: "Up" });
const upAddress = await up.getAddress();

console.log("\n═══════════════════════════════════════════");
console.log("  Deployment complete!");
console.log(`  UP Token : ${upAddress}`);
console.log("  NOTE: Call startTGE() after adding LP.");
console.log("═══════════════════════════════════════════\n");
