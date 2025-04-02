require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
      blockConfirmation: 6,
    },
    hardhat: {
      chainId: 31337,
      blockConfirmation: 1,
    }
  },
  solidity: {
    version: "0.8.28",
    settings: {
      viaIR: true, 
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner: {
      default: 1,
    },
    donater: {
      default: 2,
      11155111: "0xf579F58C244fFab25A7294bD44363207769D8Db6",
    }
  },
};
