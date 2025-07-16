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

    // 🚀 3. Find optimal loan amount using golden-section search
    const { optimalLoanAmount, profit, minOuts } = await findOptimalLoanAmount(reserves, decimals);

    return {
      profit,
      optimalLoanAmount,
      minOuts: minOuts.map(v => (v * 97n) / 100n) // 3% slippage buffer
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

async function findOptimalLoanAmount(reserves, decimals) {
    const profitFunction = async (amount) => {
        const result = await simulateProfitWithAmount(amount, reserves);
        return result.profit;
    };

    const min = ethers.parseUnits("1", decimals);
    const max = ethers.parseUnits("1000000", decimals);
    const optimalLoanAmount = await goldenSectionSearch(profitFunction, min, max, 100);

    const { profit, outs } = await simulateProfitWithAmount(optimalLoanAmount, reserves);

    return {
        optimalLoanAmount,
        profit,
        minOuts: outs,
    };
}

async function goldenSectionSearch(f, a, b, n) {
    const gr = (Math.sqrt(5) + 1) / 2;
    let c = b - (b - a) / gr;
    let d = a + (b - a) / gr;
    while (n > 0) {
        if (await f(c) > await f(d)) {
            b = d;
        } else {
            a = c;
        }
        c = b - (b - a) / gr;
        d = a + (b - a) / gr;
        n--;
    }
    return (b + a) / 2n;
}


module.exports = { simulateArbitrage };
