// Try multiple possible locations for the ABI
let abi;
try {
  // First try Hardhat artifacts location
  abi = require("./artifacts/contracts/SmartContract.sol/SmartContract.json").abi;
} catch (e) {
  try {
    // Try alternate location
    abi = require("./artifacts/contracts/SmartContract.json").abi;
  } catch (e2) {
    // Fallback to local file
    abi = require("./SmartContract.json").abi;
  }
}

module.exports = {
  CONTRACT_ADDRESS: "0xb7B4EF549ac3DE3CBac3046bd0D90acf44AF32B9", // deployed contract
  ABI: abi,

  // Alchemy WebSocket URL (real-time mempool)
  WS_PROVIDER: process.env.POLYGON_WS_URL || "wss://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY",

  // Wallet private key - ALWAYS USE ENVIRONMENT VARIABLES!
  PRIVATE_KEY: process.env.PRIVATE_KEY,

  // Minimum profit thresholds
  MIN_PROFIT_USD: 10,
  MIN_PROFIT_PERCENTAGE: 0.5, // 0.5% minimum profit

  // Slippage tolerance (in basis points, 300 = 3%)
  SLIPPAGE_TOLERANCE: 300,

  // Flash loan limits
  MIN_FLASH_LOAN_USD: 1000,
  MAX_FLASH_LOAN_USD: 100000,
  FLASH_LOAN_STEP_USD: 1000,

  // Alchemy Gas Manager
  GAS_MANAGER_CONFIG: {
    apiUrl: "https://dashboard.alchemy.com/api/gas-manager",
    apiKey: process.env.ALCHEMY_GAS_MANAGER_KEY || "your-gas-manager-key",
    gasLimit: 1000000,
    maxGasPrice: 50 // Max gas price in gwei
  },

  // Performance settings
  MAX_CONCURRENT_SIMULATIONS: 5,
  PATH_CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  MEMPOOL_SCAN_COOLDOWN_MS: 1000, // 1 second between mempool scans
  PERIODIC_SCAN_INTERVAL_MS: 30000, // 30 seconds

  // Token whitelist (only arbitrage these tokens to avoid low liquidity)
  TOKEN_WHITELIST: [
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
    "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
    "0x1bfd67037b42cf73acF2047067bd4F2C47D9BfD6", // WBTC
    "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", // AAVE
    "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39"  // LINK
  ],

  // DEX whitelist (only use high-volume DEXs)
  DEX_WHITELIST: [
    "quickswap",
    "sushiswap",
    "apeswap"
  ],

  // Logging configuration
  LOGGING: {
    level: "info", // debug, info, warn, error
    logFile: "arbitrage-bot.log",
    successLogFile: "arbitrage-success.json"
  },

  // Safety features
  SAFETY: {
    maxSlippage: 5, // Maximum 5% slippage allowed
    minLiquidity: 10000, // Minimum $10k liquidity required
    maxGasPercentOfProfit: 50, // Gas can't exceed 50% of profit
    emergencyStop: false // Set to true to stop all trading
  }
};
