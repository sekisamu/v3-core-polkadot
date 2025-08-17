import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@parity/hardhat-polkadot";

import * as dotenv from "dotenv";
dotenv.config();

const usePolkaVM = process.env.USE_POLKAVM === "true";

const config: HardhatUserConfig = {
  solidity: "0.8.30",
  resolc: {
    compilerSource: "binary",
    settings: {
      compilerPath: "resolc-0.3.0",
      optimizer: {
        enabled: true,
        parameters: "s",
        fallbackOz: true,
      },
    }
  },
  mocha: {
    timeout: 100000
  },
  networks: {
    hardhat: usePolkaVM
      ? {
          polkavm: true,
          nodeConfig: {
            nodeBinaryPath: "../revive-dev-node",
            rpcPort: 8000,
            dev: true,
          },
          adapterConfig: {
            adapterBinaryPath: "../eth-rpc",
            dev: true,
          },
        }
      : {},
    local: {
      polkavm: true,
      url: 'http://127.0.0.1:8545',
      // url: 'http://maat:8545',
      accounts: [
        process.env.LOCAL_PRIV_KEY as string,
        process.env.AH_PRIV_KEY as string,
      ],
    },

    passethub: {
      polkavm: true,
      url: "https://testnet-passet-hub.polkadot.io",
      accounts: [
        process.env.AH_PRIV_KEY as string,
      ],
    },
  }
};

export default config;
