const { ethers } = require("ethers");
const { getReserves, getAllReservesForPair } = require("./utils");

// Popular tokens on Polygon with good liquidity
const TOKENS = {
  WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
  WBTC: "0x1bfd67037b42cf73acF2047067bd4F2C47D9BfD6",
  AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
  LINK: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
  CRV: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
  SUSHI: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a"
};

// DEX routers on Polygon
const ROUTERS = {
  quickswap: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
  sushiswap: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  apeswap: "0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607",
  jetswap: "0x5C6EC38fb0e2609672BDf628B1fD605A523E5923"
};

// Graph structure to represent token connections
class TokenGraph {
  constructor() {
    this.edges = new Map(); // token -> Map(token -> [dex1, dex2, ...])
  }

  addEdge(tokenA, tokenB, dex) {
    if (!this.edges.has(tokenA)) {
      this.edges.set(tokenA, new Map());
    }
    if (!this.edges.get(tokenA).has(tokenB)) {
      this.edges.get(tokenA).set(tokenB, []);
    }
    this.edges.get(tokenA).get(tokenB).push(dex);
  }

  getNeighbors(token) {
    return this.edges.get(token) || new Map();
  }
}

// Build graph of available token pairs across all DEXs
async function buildTokenGraph() {
  const graph = new TokenGraph();
  const tokenAddresses = Object.values(TOKENS);
  
  console.log("🔍 Building token graph...");
  
  // Check all possible token pairs
  for (let i = 0; i < tokenAddresses.length; i++) {
    for (let j = i + 1; j < tokenAddresses.length; j++) {
      const tokenA = tokenAddresses[i];
      const tokenB = tokenAddresses[j];
      
      try {
        // Get reserves for this pair across all DEXs
        const allReserves = await getAllReservesForPair(tokenA, tokenB);
        
        // Add edges for each DEX that has this pair
        for (const { dex, reserves } of allReserves) {
          if (reserves && reserves[0] > 0n && reserves[1] > 0n) {
            // Find the router address for this DEX
            const routerAddress = ROUTERS[dex] || "0x0000000000000000000000000000000000000000";
            
            // Add bidirectional edges
            graph.addEdge(tokenA, tokenB, { name: dex, router: routerAddress });
            graph.addEdge(tokenB, tokenA, { name: dex, router: routerAddress });
          }
        }
      } catch (err) {
        // Skip pairs that error out
        console.error(`Error checking pair:`, err.message);
      }
    }
  }
  
  return graph;
}

function findPaths(graph, startToken, maxHops = 3, maxPaths = 20) {
    const paths = [];
    const queue = [[startToken, [], []]]; // [token, path_so_far, dexes_so_far]

    while (queue.length > 0) {
        const [currentToken, currentPath, currentDexes] = queue.shift();

        if (currentPath.length >= maxHops) continue;

        const neighbors = graph.getNeighbors(currentToken);
        if (!neighbors) continue;

        for (const [nextToken, dexes] of neighbors) {
            if (nextToken === startToken) {
                // Found a cycle
                for (const dex of dexes) {
                    const newPath = [...currentPath, currentToken, nextToken];
                    const newDexes = [...currentDexes, dex];
                    const pathObject = {
                        tokens: newPath,
                        dexes: newDexes,
                    };
                    for (let i = 0; i < newPath.length - 1; i++) {
                        pathObject[`path${i + 1}`] = [newPath[i], newPath[i + 1]];
                    }
                    paths.push(pathObject);
                    if (paths.length >= maxPaths) return paths;
                }
            } else if (!currentPath.includes(nextToken)) {
                // Continue exploring
                for (const dex of dexes) {
                    const newPath = [...currentPath, currentToken];
                    const newDexes = [...currentDexes, dex];
                    queue.push([nextToken, newPath, newDexes]);
                }
            }
        }
    }

    return paths;
}

// Find paths with highest liquidity (best reserves)
async function rankPathsByLiquidity(paths) {
    const pathsWithLiquidity = [];

    for (const path of paths) {
        try {
            let totalLiquidity = 0n;

            // Calculate total liquidity across all hops
            for (let i = 0; i < path.tokens.length - 1; i++) {
                const hopPath = path[`path${i + 1}`];
                const reserves = await getReserves(hopPath);
                if (reserves) {
                    // Use geometric mean of reserves as liquidity metric
                    totalLiquidity += BigInt(Math.sqrt(Number(reserves[0]) * Number(reserves[1])));
                }
            }

            pathsWithLiquidity.push({
                ...path,
                liquidity: totalLiquidity,
            });
        } catch (err) {
            console.error("Error calculating liquidity:", err);
        }
    }

    // Sort by liquidity (highest first)
    return pathsWithLiquidity.sort((a, b) => {
        if (a.liquidity > b.liquidity) return -1;
        if (a.liquidity < b.liquidity) return 1;
        return 0;
    });
}


// Main function to find best arbitrage opportunities
async function findBestArbitragePaths(targetTokens = null) {
    // Build the token graph
    const graph = await buildTokenGraph();

    // Use provided tokens or default to high-liquidity ones
    const tokensToCheck = targetTokens || [TOKENS.USDC, TOKENS.WETH, TOKENS.WMATIC];

    let allPaths = [];

    // Find paths for each target token
    for (const token of tokensToCheck) {
        console.log(`🔎 Finding paths for ${getTokenSymbol(token)}...`);
        const paths = findPaths(graph, token, 5); // Find paths with up to 5 hops
        allPaths = allPaths.concat(paths);
    }

    console.log(`📊 Found ${allPaths.length} total paths`);

    // Rank paths by liquidity
    const rankedPaths = await rankPathsByLiquidity(allPaths);

    // Return top paths
    return rankedPaths.slice(0, 10);
}

// Helper to get token symbol
function getTokenSymbol(address) {
  for (const [symbol, addr] of Object.entries(TOKENS)) {
    if (addr.toLowerCase() === address.toLowerCase()) {
      return symbol;
    }
  }
  return address.slice(0, 6) + "...";
}

// Format path for display
function formatPath(path) {
    const tokens = path.tokens.map(t => getTokenSymbol(t));
    const dexes = path.dexes.map(d => d.name);
    let pathStr = "";
    for (let i = 0; i < tokens.length - 1; i++) {
        pathStr += `${tokens[i]} → ${tokens[i + 1]} (${dexes[i]})`;
        if (i < tokens.length - 2) {
            pathStr += " → ";
        }
    }
    return pathStr;
}

// Export for use in scanner
module.exports = {
    findBestArbitragePaths,
    formatPath,
    buildTokenGraph,
    findPaths,
    TOKENS,
    ROUTERS
};
