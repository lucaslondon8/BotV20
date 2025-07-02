require("dotenv").config();
const hre = require("hardhat");
const { getAddress } = require("ethers");

async function main() {
  const signer = (await hre.ethers.getSigners())[0];
  console.log("Deploying contract with:", signer.address);

  const Contract = await hre.ethers.getContractFactory("SmartContract");

  // ⚠️ Raw address strings wrapped in getAddress() to fix checksum issue
  const aave = getAddress("0xa97684ead0e402dc232d5a977953df7ecbab3cdb");
  const r1 = getAddress("0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff");
  const r2 = getAddress("0x1b02da8cb0d097eb8d57a175b88c7d8b47997506");
  const r3 = getAddress("0x3fb16dcbe1c2fa1f0e2531b82d89b4ed6b1c7c58");

  const contract = await Contract.deploy(aave, r1, r2, r3);
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("✅ Contract deployed at:", deployedAddress);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});

