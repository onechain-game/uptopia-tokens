// scripts/genWallets.ts
// Generate 10 wallets from a mnemonic phrase (HD wallet, BIP-44)
// Usage: npx tsx scripts/genWallets.ts "your mnemonic phrase here"

import { HDNodeWallet, Mnemonic } from "ethers";

const mnemonicPhrase = process.argv[2];
if (!mnemonicPhrase) {
  console.error("Usage: npx tsx scripts/genWallets.ts \"your mnemonic phrase here\"");
  process.exit(1);
}

const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase);

console.log("Mnemonic:", mnemonicPhrase);
console.log("\nIndex | Address                                    | Private Key");
console.log("------|--------------------------------------------|------------------------------------------");

for (let i = 0; i < 10; i++) {
  const path = `m/44'/60'/0'/0/${i}`;
  const wallet = HDNodeWallet.fromMnemonic(mnemonic, path);
  console.log(
    `${i.toString().padEnd(5)} | ${wallet.address} | ${wallet.privateKey}`
  );
}
