// scanner.js - Fixed version with proper initialization
// Load environment variables FIRST before any other imports
require('dotenv').config();

const { ethers } = require("ethers");
const fetch = require("node-fetch");
const { simulateArbitrage } = require("./simulate");
const { findBestArbitragePaths, formatPath, TOKENS, ROUTERS } = require("./pathfinder");
const {
  CONTRACT_ADDRESS,
  ABI,
  WS_PROVIDER,
  PRIVATE_KEY,
  MIN_PROFIT_USD,
  GAS_MANAGER_CONFIG
} = require("./config");

// Validate required configuration
if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY is not set in environment variables!");
  console.error("Please ensure your .env file contains: PRIVATE_KEY=0x...");
  process.exit(1);
}

if (!WS_PROVIDER) {
  console.error("❌ WS_PROVIDER is not set!");
  process.exit(1);
}

// Initialize globals - but DON'T create wallet yet
let provider, wallet, contract;

// Cache for discovered paths (refresh every 5 minutes)
let pathCache = [];
let lastPathUpdate = 0;
const PATH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Initialize connection
async function initialize() {
  try {
    console.log("🔌 Connecting to Polygon...");
    provider = new ethers.WebSocketProvider(WS_PROVIDER);
    
    // Wait for provider to be ready
    await provider.ready;
    
    // Now create wallet
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    
    console.log("✅ Connected to Polygon");
    console.log("👛 Wallet address:", wallet.address);
    console.log("📄 Contract address:", CONTRACT_ADDRESS);
    
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize:", error.message);
    return false;
  }
}

// ⛽ Pull gas overrides from Alchemy Gas Manager
async function getGasOverrides() {
  try {
    const res = await fetch(GAS_MANAGER_CONFIG.apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${GAS_MANAGER_CONFIG.apiKey}`,
        "Accept": "application/json"
      }
    });

    const data = await res.json();

    return {
      maxFeePerGas: ethers.parseUnits(data.maxFeePerGas, "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits(data.maxPriorityFeePerGas, "gwei"),
      gasLimit: GAS_MANAGER_CONFIG.gasLimit || 1_000_000
    };
  } catch (err) {
    console.warn("⚠️ Gas Manager fallback:", err.message);
    return { gasLimit: 1_000_000 };
  }
}

// 🔄 Update path cache if needed
async function updatePathCache() {
  const now = Date.now();
  if (now - lastPathUpdate > PATH_CACHE_DURATION) {
    console.log("🔄 Updating arbitrage paths...");
    
    // Find best paths for major tokens
    const targetTokens = [
      TOKENS.USDC,
      TOKENS.WETH,
      TOKENS.WMATIC,
      TOKENS.USDT,
      TOKENS.DAI
    ];
    
    try {
      pathCache = await findBestArbitragePaths(targetTokens);
      lastPathUpdate = now;
      
      console.log(`✅ Found ${pathCache.length} profitable paths:`);
      pathCache.slice(0, 5).forEach(path => {
        console.log(`  - ${formatPath(path)}`);
      });
    } catch (err) {
      console.error("❌ Failed to update paths:", err);
    }
  }
}

// 🔁 Try to arbitrage one path
async function handlePath(path) {
  try {
    const { tokens, path1, path2, path3 } = path;
    const tokenA = tokens[0];
    
    const result = await simulateArbitrage({ tokenA, path1, path2, path3 });
    if (!result || !result.profit) return;

    const minProfit = ethers.parseUnits(MIN_PROFIT_USD.toString(), 6);
    const { profit, minOuts, optimalLoanAmount } = result;

    if (profit > minProfit) {
      console.log(`🚀 Profitable arb found: ${formatPath(path)}`);
      console.log(`   💰 Profit: $${ethers.formatUnits(profit, 6)}`);
      console.log(`   💸 Loan amount: $${ethers.formatUnits(optimalLoanAmount, 6)}`);
      
      const gasOverrides = await getGasOverrides();

      // Uncomment to execute trades
      /*
      const tx = await contract.executeArbitrage(
        tokenA,
        path1,
        path2,
        path3,
        optimalLoanAmount,
        minOuts,
        gasOverrides
      );

      console.log("📤 TX sent:", tx.hash);
      await tx.wait();
      console.log("✅ TX confirmed!");
      */
      
      console.log("   ⚠️  Execution disabled - uncomment to enable");
      
      return true;
    }
  } catch (err) {
    console.error(`❌ Error on path ${formatPath(path)}:`, err.message);
  }
  
  return false;
}

// 📝 Log successful arbitrages
function logArbitrage(data) {
  const fs = require("fs");
  const logFile = "arbitrage-log.json";
  
  let logs = [];
  try {
    if (fs.existsSync(logFile)) {
      logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read log file:", err);
  }
  
  logs.push(data);
  
  try {
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("Failed to write log file:", err);
  }
}

// 🎯 Scan all cached paths for opportunities
async function scanAllPaths() {
  await updatePathCache();
  
  if (pathCache.length === 0) {
    console.log("⚠️ No paths available");
    return;
  }
  
  console.log(`🔍 Scanning ${pathCache.length} paths...`);
  
  // Process paths in parallel (but limit concurrency)
  const BATCH_SIZE = 3; // Reduced from 5 to avoid rate limits
  for (let i = 0; i < pathCache.length; i += BATCH_SIZE) {
    const batch = pathCache.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(handlePath));
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // If we found a profitable arbitrage, stop scanning
    if (results.some(r => r.status === 'fulfilled' && r.value === true)) {
      console.log("💎 Arbitrage executed, pausing scan");
      return;
    }
  }
}

// 🧠 Enhanced mempool monitoring
async function setupMempoolMonitoring() {
  provider.on("pending", async (txHash) => {
    try {
      const tx = await provider.getTransaction(txHash);
      if (!tx?.to || !tx?.data) return;

      // Check if transaction is to a DEX router
      const isDexTx = Object.values(ROUTERS).some(
        router => router.toLowerCase() === tx.to.toLowerCase()
      );
      
      if (!isDexTx) return;

      // Decode transaction to see if it's a swap
      const swapSigs = [
        "0x38ed1739", // swapExactTokensForTokens
        "0x8803dbee", // swapTokensForExactTokens
        "0x7ff36ab5", // swapExactETHForTokens
        "0x18cbafe5", // swapExactTokensForETH
        "0xfb3bdb41", // swapETHForExactTokens
        "0x4a25d94a"  // swapTokensForExactETH
      ];
      
      const funcSig = tx.data.slice(0, 10);
      if (!swapSigs.includes(funcSig)) return;

      console.log(`🔁 DEX swap detected (${tx.to}), checking arbitrage opportunities...`);
      await scanAllPaths();
    } catch (err) {
      // Ignore errors for pending transactions
    }
  });
}

// 📊 Periodic scanning
async function periodicScan() {
  while (true) {
    try {
      await scanAllPaths();
    } catch (err) {
      console.error("❌ Periodic scan error:", err);
    }
    
    // Wait 30 seconds before next scan
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// 🚀 Start the bot
async function start() {
  console.log("🤖 Arbitrage Bot Starting...");
  console.log(`📍 Contract: ${CONTRACT_ADDRESS}`);
  console.log(`💰 Min profit threshold: $${MIN_PROFIT_USD}`);
  
  // Initialize connection
  const initialized = await initialize();
  if (!initialized) {
    console.error("❌ Failed to initialize. Exiting...");
    process.exit(1);
  }
  
  // Initial path discovery
  await updatePathCache();
  
  // Setup mempool monitoring
  await setupMempoolMonitoring();
  
  // Start periodic scanning
  periodicScan();
  
  console.log("✅ Bot is running!");
  console.log("👀 Monitoring mempool for DEX transactions...");
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n👋 Shutting down...");
  if (provider) {
    await provider.destroy();
  }
  process.exit(0);
});

// Start the bot
start().catch(console.error);
