require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    polygon: {
      url: process.env.ALCHEMY_KEY,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};

