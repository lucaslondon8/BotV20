const { ethers } = require("ethers");
const IUniswapPair = require("./abis/IUniswapV2Pair.json");
const IUniswapFactory = require("./abis/IUniswapV2Factory.json");

// Load environment variables
require('dotenv').config();

// Use Alchemy provider
let sharedProvider;
function getProvider() {
  if (!sharedProvider) {
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

const provider = getProvider();

// Extended factory list for Polygon
const FACTORY_ADDRESSES = {
  quickswap: "0x5757371414417b8c6caad45baef941abc7d3ab32",
  sushiswap: "0xc35dadb65012ec5796536bd9864ed8773abc74c4",
  apeswap: "0xCf083Be4164828f00cAE704EC15a36D711491284",
  jetswap: "0x668ad0ed2622C62E24f0d5ab6B6Ac1b9D2cD4AC7",
  wault: "0xa98ea6356A316b44Bf710D5f9b6b4eA0081409Ef",
  polycat: "0x477Ce834Ae6b7aB003cCe4BC4d8697763FF456FA"
};

// Cache for pair addresses to reduce RPC calls
const pairCache = new Map();

// Get pair address from cache or factory
async function getPairAddress(factoryAddress, tokenA, tokenB) {
  const cacheKey = `${factoryAddress}-${tokenA}-${tokenB}`;
  const reverseCacheKey = `${factoryAddress}-${tokenB}-${tokenA}`;
  
  // Check cache first
  if (pairCache.has(cacheKey)) {
    return pairCache.get(cacheKey);
  }
  if (pairCache.has(reverseCacheKey)) {
    return pairCache.get(reverseCacheKey);
  }
  
  try {
    const factory = new ethers.Contract(factoryAddress, IUniswapFactory, provider);
    const pairAddress = await factory.getPair(tokenA, tokenB);
    
    // Cache the result
    pairCache.set(cacheKey, pairAddress);
    pairCache.set(reverseCacheKey, pairAddress);
    
    return pairAddress;
  } catch (err) {
    return ethers.ZeroAddress;
  }
}

// Get reserve data for a token swap path with specific DEX
async function getReservesFromDex(path, dexName) {
  const [tokenIn, tokenOut] = path;
  const factoryAddress = FACTORY_ADDRESSES[dexName];
  
  if (!factoryAddress) {
    throw new Error(`Unknown DEX: ${dexName}`);
  }
  
  try {
    const pairAddress = await getPairAddress(factoryAddress, tokenIn, tokenOut);
    
    if (pairAddress === ethers.ZeroAddress) {
      return null;
    }
    
    const pair = new ethers.Contract(pairAddress, IUniswapPair, provider);
    const reserves = await pair.getReserves();
    const token0 = await pair.token0();
    
    const [reserve0, reserve1] = reserves;
    
    // Return reserves in correct order [tokenIn, tokenOut]
    return token0.toLowerCase() === tokenIn.toLowerCase()
      ? [reserve0, reserve1]
      : [reserve1, reserve0];
  } catch (err) {
    console.warn(`Failed to get reserves from ${dexName}: ${err.message}`);
    return null;
  }
}

// Get reserve data for a token swap path (checks all DEXs)
async function getReserves(path) {
  const [tokenIn, tokenOut] = path;

  // Try all factories in parallel with limited concurrency
  const batchSize = 3; // Process 3 DEXs at a time
  const dexEntries = Object.entries(FACTORY_ADDRESSES);
  const results = [];
  
  for (let i = 0; i < dexEntries.length; i += batchSize) {
    const batch = dexEntries.slice(i, i + batchSize);
    const batchPromises = batch.map(async ([dexName, factoryAddress]) => {
      try {
        const pairAddress = await getPairAddress(factoryAddress, tokenIn, tokenOut);
        
        if (pairAddress === ethers.ZeroAddress) {
          return null;
        }

        const pair = new ethers.Contract(pairAddress, IUniswapPair, provider);
        const reserves = await pair.getReserves();
        const token0 = await pair.token0();

        const [reserve0, reserve1] = reserves;
        
        // Return reserves with DEX info
        const orderedReserves = token0.toLowerCase() === tokenIn.toLowerCase()
          ? [reserve0, reserve1]
          : [reserve1, reserve0];
          
        return {
          reserves: orderedReserves,
          dex: dexName,
          pairAddress
        };
      } catch (err) {
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const validResults = results.filter(r => r !== null);

  if (validResults.length === 0) {
    return null;
  }

  // Return the result with highest liquidity (product of reserves)
  const best = validResults.reduce((prev, curr) => {
    const prevLiquidity = prev.reserves[0] * prev.reserves[1];
    const currLiquidity = curr.reserves[0] * curr.reserves[1];
    return currLiquidity > prevLiquidity ? curr : prev;
  });

  return best.reserves;
}

// Get reserves from all available DEXs for a pair
async function getAllReservesForPair(tokenA, tokenB) {
  const results = [];
  
  // Process in batches to avoid rate limits
  const batchSize = 3;
  const dexEntries = Object.entries(FACTORY_ADDRESSES);
  
  for (let i = 0; i < dexEntries.length; i += batchSize) {
    const batch = dexEntries.slice(i, i + batchSize);
    const batchPromises = batch.map(async ([dexName, factoryAddress]) => {
      try {
        const pairAddress = await getPairAddress(factoryAddress, tokenA, tokenB);
        
        if (pairAddress === ethers.ZeroAddress) {
          return null;
        }
        
        const pair = new ethers.Contract(pairAddress, IUniswapPair, provider);
        const reserves = await pair.getReserves();
        const token0 = await pair.token0();
        
        const [reserve0, reserve1] = reserves;
        const orderedReserves = token0.toLowerCase() === tokenA.toLowerCase()
          ? [reserve0, reserve1]
          : [reserve1, reserve0];
        
        return {
          dex: dexName,
          reserves: orderedReserves,
          pairAddress,
          liquidity: BigInt(Math.sqrt(Number(reserve0) * Number(reserve1)))
        };
      } catch (err) {
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null));
  }
  
  return results;
}

// Clear pair cache (useful for periodic refresh)
function clearPairCache() {
  pairCache.clear();
}

// Export all utility functions
module.exports = {
  getReserves,
  getReservesFromDex,
  getAllReservesForPair,
  clearPairCache,
  FACTORY_ADDRESSES
};
