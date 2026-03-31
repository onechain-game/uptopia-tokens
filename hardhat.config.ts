import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import dotenv from "dotenv";
dotenv.config();

export default defineConfig({
  plugins: [
    hardhatToolboxMochaEthersPlugin, 
    hardhatVerify
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.22",
      },
      production: {
        version: "0.8.22",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
     // Base Mainnet configuration
    base: {
      type: "http",
      chainType: "op",
      url: process.env.BASE_RPC_URL ? process.env.BASE_RPC_URL : "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Base Sepolia (testnet) configuration
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: process.env.BASE_SEPOLIA_RPC_URL ? process.env.BASE_SEPOLIA_RPC_URL : "https://sepolia.base.org",
      accounts: process.env.TESTNET_PRIVATE_KEY ? [process.env.TESTNET_PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("SCAN_API_KEY"),
      enabled: true,
    },
  },
});
