// scripts/constructor-args.ts
// Export constructor arguments for Up contract (for verification)
// Usage: npx tsx scripts/constructor-args.ts > constructor-args.js

import { parseEther } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const THREE_MONTHS = 90 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TWO_YEARS = 730 * 24 * 60 * 60;

const allocations = [[
  [
    process.env.EARLY_BACKERS,
    parseEther("100000000").toString(),
    0,
    SIX_MONTHS,
    THREE_MONTHS,
    parseEther("10000000").toString(),
    false,
  ],
  [
    process.env.STRATEGIC_BACKERS,
    parseEther("25000000").toString(),
    0,
    SIX_MONTHS,
    THREE_MONTHS,
    parseEther("2500000").toString(),
    false,
  ],
  [
    process.env.PUBLIC_SALE,
    parseEther("25000000").toString(),
    parseEther("25000000").toString(),
    0,
    0,
    0,
    true,
  ],
  [
    process.env.ECOSYSTEM_GROWTH,
    parseEther("75000000").toString(),
    parseEther("18750000").toString(),
    SIX_MONTHS,
    THREE_MONTHS,
    parseEther("7500000").toString(),
    false,
  ],
  [
    process.env.COMMUNITY_DEV,
    parseEther("70000000").toString(),
    parseEther("35000000").toString(),
    SIX_MONTHS,
    THREE_MONTHS,
    parseEther("7000000").toString(),
    false,
  ],
  [
    process.env.LIQUIDITY_PROVISION,
    parseEther("30000000").toString(),
    parseEther("30000000").toString(),
    0,
    0,
    0,
    true,
  ],
  [
    process.env.FOUNDATION_RESERVE,
    parseEther("50000000").toString(),
    0,
    ONE_YEAR,
    THREE_MONTHS,
    parseEther("5000000").toString(),
    false,
  ],
  [
    process.env.CORE_CONTRIBUTORS,
    parseEther("100000000").toString(),
    0,
    TWO_YEARS,
    THREE_MONTHS,
    parseEther("10000000").toString(),
    false,
  ],
  [
    process.env.ADVISORS,
    parseEther("25000000").toString(),
    0,
    TWO_YEARS,
    THREE_MONTHS,
    parseEther("2500000").toString(),
    false,
  ],
]];

export default allocations;
