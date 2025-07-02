const { ethers } = require("ethers");
const { getReserves } = require("./utils");
const IERC20 = require("./abis/IERC20.json");

// Load environment variables
require('dotenv').config();

// Use Alchemy provider with better configuration
let sharedProvider;
function getProvider() {
  if (!sharedProvider) {
    // Use Alchemy URL from environment
    const alchemyUrl = process.env.ALCHEMY_KEY;
    if (!alchemyUrl) {
      throw new Error("ALCHEMY_KEY not set in environment!");
    }
    
    sharedProvider = new ethers.JsonRpcProvider(alchemyUrl, {
      chainId: 137,
      name: 'polygon'
    });
  }
  return sharedProvider;
}

// Cache for token decimals to reduce RPC calls
const decimalsCache = new Map();

// Get token decimals with caching
async function getTokenDecimals(tokenAddress, provider) {
  if (decimalsCache.has(tokenAddress)) {
    return decimalsCache.get(tokenAddress);
  }
  
  const contract = new ethers.Contract(tokenAddress, IERC20, provider);
  const decimals = await contract.decimals();
  decimalsCache.set(tokenAddress, decimals);
  return decimals;
}

// Simulate arbitrage for a route
async function simulateArbitrage({ tokenA, path1, path2, path3 }) {
  const provider = getProvider();
  const stepPaths = [path1, path2, path3];

  try {
    // 🔢 1. Get tokenA decimals
    const decimals = await getTokenDecimals(tokenA, provider);

    // 📦 2. Get reserves for each swap path
    const reserves = [];
    for (const path of stepPaths) {
      if (path.length < 2) {
        reserves.push(null);
        continue;
      }
      const r = await getReserves(path);
      if (!r) return null;
      reserves.push(r);
    }

    // 🚀 3. Simulate flash loan sizes from $1k to $100k
    const simulations = [];
    for (let usd = 1000; usd <= 100000; usd += 1000) {
      const amount = ethers.parseUnits(usd.toString(), decimals);
      simulations.push(simulateProfitWithAmount(amount, reserves));
    }

    const results = await Promise.allSettled(simulations);

    // 📈 4. Find most profitable option
    let bestProfit = 0n;
    let bestAmount = 0n;
    let bestOuts = [0n, 0n, 0n];

    for (const res of results) {
      if (res.status === "fulfilled" && res.value && res.value.profit > bestProfit) {
        bestProfit = res.value.profit;
        bestAmount = res.value.input;
        bestOuts = res.value.outs;
      }
    }

    return {
      profit: bestProfit,
      optimalLoanAmount: bestAmount,
      minOuts: bestOuts.map(v => (v * 97n) / 100n) // 3% slippage buffer
    };
  } catch (err) {
    console.error("❌ Simulation failed:", err.message);
    return null;
  }
}

// Simulate profit for a specific input amount
async function simulateProfitWithAmount(input, reserves) {
  let amount = input;
  const outs = [];

  for (let i = 0; i < 3; i++) {
    const r = reserves[i];
    if (!r) break;

    const [reserveIn, reserveOut] = r;
    const amountOut = getAmountOut(amount, reserveIn, reserveOut);
    outs.push(amountOut);
    amount = amountOut;
  }

  const profit = amount > input ? amount - input : 0n;
  return { profit, input, outs };
}

// Uniswap V2 constant product formula
function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

module.exports = { simulateArbitrage };
