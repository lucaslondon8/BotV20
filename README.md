BotV20 is an arbitrage bot for the Polygon network built using Hardhat. It uses an on-chain
SmartContract that executes triangular arbitrage with flash loans from Aave and swaps through
several DEX routers. JavaScript utilities are provided to discover profitable paths, simulate
potential profits, and watch the mempool for opportunities.

## Project Structure

.
├── contracts/                # Solidity contracts
│   ├── SmartContract.sol     # Main arbitrage contract
│   ├── IUniswapV2Router02.sol# Uniswap V2 router interface
│   └── Lock.sol              # Sample contract (with tests)
├── scripts/                  # Hardhat/JS helpers
│   ├── deploy.js             # Deployment script
│   ├── scanner.js            # Main bot logic
│   ├── pathfinder.js         # Builds token graphs & arbitrage paths
│   ├── simulate.js           # Simulates arbitrage profitability
│   ├── utils.js              # Reserve-data helpers
│   └── config.js             # Runtime configuration
├── test/                     # Hardhat tests for Lock.sol
└── ignition/
    └── modules/              # Hardhat Ignition deployment module

# (Add your “Requirements” section here if you’d like it to follow the tree)


Requirements

Node.js (version 14 or higher)
Hardhat and its toolbox
Access to an RPC/WebSocket endpoint for Polygon (Alchemy recommended)
Setup

Install dependencies
npm install
Create a .env file
ALCHEMY_KEY=<Polygon RPC URL>
POLYGON_WS_URL=<WebSocket URL for mempool monitoring>
PRIVATE_KEY=<private key of the deploying/trading wallet>
ALCHEMY_GAS_MANAGER_KEY=<optional – gas manager API key>
Deploy the contract
npx hardhat run scripts/deploy.js --network polygon
Record the contract address and update config.js if necessary.
Running the Bot

Start the arbitrage scanner:

vv
node scanner.js
The script connects to the Polygon network via WebSocket, constructs and caches
profitable triangular paths, monitors DEX transactions in the mempool, and simulates
arbitrage. By default, actual trade execution is disabled—uncomment the relevant
section in scanner.js once you are confident in the configuration.

Testing

The repository includes Hardhat tests for the sample Lock contract:

npx hardhat test
Important Notes

Flash Loans: The SmartContract uses Aave V3 flash loans. Ensure your
configuration and allowances are correct before enabling live trades.
Configuration: Profit thresholds, slippage tolerances, whitelisted tokens, and other
options are defined in config.js.
Gas Management: If using Alchemy Gas Manager, set ALCHEMY_GAS_MANAGER_KEY
in your environment variables.
Use this project at your own risk. Always test thoroughly on a forked or test network
before deploying to mainnet.
