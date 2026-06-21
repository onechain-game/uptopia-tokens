// scripts/constructor-args.ts
// Export constructor arguments for Up contract verification.
// Usage: UP_RECEIVER=0x... npx tsx scripts/constructor-args.ts > constructor-args.js

import dotenv from "dotenv";
dotenv.config();

const receiver = process.env.UP_RECEIVER;
if (!receiver) {
  throw new Error("UP_RECEIVER env variable is required");
}

export default [receiver];
