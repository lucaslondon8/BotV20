# BotV20 – Polygon Triangular Arbitrage Bot

BotV20 is a **Hardhat‑powered flash‑loan arbitrage bot** for the Polygon network. It takes out Aave V3 flash loans, executes triangular swaps across multiple DEX routers, and settles everything atomically in a single transaction. JavaScript utilities are bundled to discover profitable paths, simulate outcomes, and monitor the mempool for real‑time opportunities.

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Requirements](#requirements)
4. [Setup](#setup)
5. [Running the Bot](#running-the-bot)
6. [Testing](#testing)
7. [Configuration](#configuration)
8. [Security & Risk](#security--risk)
9. [Roadmap](#roadmap)
10. [Contributing](#contributing)
11. [License](#license)

---

## Features

|  Domain                |  What it does                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **On‑chain Arbitrage** | Executes atomic triangular swaps using Aave flash loans and multiple DEX router interfaces. |
| **Path Discovery**     | Builds token‑pair graphs, prunes illiquid edges, and scores candidate paths.                |
| **Profit Simulation**  | Off‑chain math to estimate slippage, fees, and net profit before broadcasting.              |
| **Mempool Sniping**    | Listens to Polygon WebSocket mempool traffic and reacts to price movements in real time.    |
| **Modular Scripts**    | Separate helpers (`deploy.js`, `scanner.js`, `simulate.js`) keep concerns isolated.         |

---

## Project Structure

```
.
├── contracts/                     # Solidity
│   ├── SmartContract.sol          # Main arbitrage contract
│   ├── IUniswapV2Router02.sol     # Router interface
│   └── Lock.sol                   # Sample contract + tests
├── scripts/                       # Hardhat / Node.js utilities
│   ├── deploy.js                  # Deployment helper
│   ├── scanner.js                 # Core bot logic (mempool + execution)
│   ├── pathfinder.js              # Token graph + path builder
│   ├── simulate.js                # Profitability simulators
│   ├── utils.js                   # Reserve / math helpers
│   └── config.js                  # Runtime options
├── test/                          # Hardhat tests for Lock.sol
└── ignition/
    └── modules/                   # Hardhat Ignition deployment module
```

---

## Requirements

- **Node.js ≥ 14**
- **Hardhat** (plus @nomicfoundation/hardhat‑toolbox)
- Polygon RPC **HTTP** endpoint (Alchemy or similar)
- Polygon **WebSocket** endpoint for mempool monitoring
- Deployer wallet with gas (MATIC)

---

## Setup

```bash
# Clone the repo
git clone <url‑to‑repo>
cd BotV20

# Install dependencies
npm install
```

### Environment variables

Create a `.env` file in the project root:

```env
ALCHEMY_KEY=YOUR_ALCHEMY_HTTPS
POLYGON_WS_URL=wss://polygon-mainnet.g.alchemy.com/v2/...
PRIVATE_KEY=0xabc123...          # deploying / trading wallet
ALCHEMY_GAS_MANAGER_KEY=...      # optional – Alchemy Gas Manager
```

### Deploy the contract

```bash
npx hardhat run scripts/deploy.js --network polygon
```

The script prints the deployed contract address—copy it into `scripts/config.js`.

---

## Running the Bot

```bash
node scripts/scanner.js
```

What happens:

1. Connects to Polygon via WebSocket.
2. Caches reserves and pre‑computes profitable triangular paths.
3. Watches mempool transactions that touch monitored DEX routers.
4. Simulates potential profit; if above threshold **and** live‑trade flag is enabled, submits the flash‑loan transaction.

> **Dry‑run:** By default, the execution call in `scanner.js` is commented out. Uncomment when you are confident in your configuration.

---

## Testing

```bash
npx hardhat test
```

Includes basic tests for the sample `Lock.sol`; extend with arbitrage‑specific scenarios as needed.

---

## Configuration

All runtime knobs live in `scripts/config.js`:

```js
module.exports = {
  trade: {
    profitThreshold: 0.003,   // 0.3 %
    slippage: 0.002,          // 0.2 %
    whitelistedTokens: [ ... ],
  },
  pathfinder: {
    maxPathDepth: 3,
    minLiquidity: 5_000,      // USDC equivalent
  },
  gas: {
    useGasManager: true,
    priorityFee: "auto"
  }
};
```

---

## Security & Risk

- **Flash Loans:** Mis‑configuration can lock funds or revert trades. Confirm allowances and parameters on a fork before mainnet deployment.
- **Gas Spikes:** Polygon gas can spike rapidly; use Alchemy Gas Manager or a custom estimator.
- **DEX Liquidity:** Thin liquidity pairs can revert; tune `minLiquidity` accordingly.
- **Use at your own risk.** Always test on a forked or test network.

---

## Roadmap

- Multi‑DEX path aggregation (Uniswap V3, Balancer)
- Automatic Aave flash‑loan premium detection
- Advanced on‑chain calldata compression to save gas
- Typescript port and stricter typings
- CI pipeline with Foundry for advanced invariant testing

---

## Contributing

Pull requests are welcome. Please:

1. Fork → feature branch → PR.
2. Run `npm run lint` and ensure tests pass.
3. Provide context in the PR description.

---

## License

This project is released under the **MIT License**.

>>>>>>> 5bf2591 (Add detailed BotV20 README)
