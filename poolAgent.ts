import DLMM from '@meteora-ag/dlmm'
import axios from 'axios'// The token addresses we care about.
const TOKENS = [
    "So11111111111111111111111111111111111111112",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
    "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu"
];

/**
 * Interface for the pair information as defined in the Meteora Swagger UI.
 */
interface Pool {
    address: string;
    apr: number;
    apy: number;
    base_fee_percentage: string;
    bin_step: number;
    cumulative_fee_volume: string;
    cumulative_trade_volume: string;
    current_price: number;
    farm_apr: number;
    farm_apy: number;
    fee_tvl_ratio: any; // Adjust type if you know its structure
    fees: any;          // Adjust type if you know its structure
    fees_24h: number;
    hide: boolean;
    is_blacklisted: boolean;
    liquidity: string;
    max_fee_percentage: string;
    mint_x: string;
    mint_y: string;
    name: string;
    protocol_fee_percentage: string;
    reserve_x: string;
    reserve_x_amount: number;
    reserve_y: string;
    reserve_y_amount: number;
    reward_mint_x: string;
    reward_mint_y: string;
    today_fees: number;
    trade_volume_24h: number;
}

/**
 * Helper function to construct the lexical order mints string.
 * It sorts the two token addresses and joins them with a hyphen.
 */
function getLexicalOrderMints(tokenA: string, tokenB: string): string {
    return [tokenA, tokenB].sort().join('-');
}

/**
 * Fetch the pair information for the given two tokens using the endpoint:
 * GET https://dlmm-api.meteora.ag/pair/group_pair/{lexical_order_mints}
 *
 * Since the endpoint returns an array of pool objects for the same pair,
 * we return that array. If an error occurs (for example, a 500 status),
 * we log a message and return an empty array.
 */
async function fetchPair(tokenA: string, tokenB: string): Promise<Pool[]> {
    const lexicalOrderMints = getLexicalOrderMints(tokenA, tokenB);
    const apiUrl = `https://dlmm-api.meteora.ag/pair/group_pair/${lexicalOrderMints}`;

    try {
        const response = await axios.get(apiUrl);
        // Expecting an array of pool objects for the given token pair.
        return response.data as Pool[];
    } catch (error: any) {
        if (error.response && error.response.status === 500) {
            console.log(`Pair not found (status 500) for tokens: ${tokenA} and ${tokenB}`);
        } else {
            console.error(`Error fetching pair for ${tokenA} and ${tokenB}:`, error.message);
        }
        return []; // Return an empty array so that this error doesn't block processing.
    }
}

/**
 * Iterate through all unique token pairs from TOKENS, fetch their pair info concurrently,
 * and return a flattened array of Pool objects.
 */
async function fetchAllPairs(): Promise<Pool[]> {
    const pairPromises: Promise<Pool[]>[] = [];

    for (let i = 0; i < TOKENS.length; i++) {
        for (let j = i + 1; j < TOKENS.length; j++) {
            pairPromises.push(fetchPair(TOKENS[i], TOKENS[j]));
        }
    }

    // Execute all requests concurrently.
    const results = await Promise.all(pairPromises);
    // Flatten the array of arrays so that each pool is a separate entry.
    const allPools: Pool[] = results.flat();
    return allPools;
}

/**
 * Compute a "yield" for the pool as a proxy for liquidity providing attractiveness.
 *
 * - If available, use fee_tvl_ratio.hour_24 (which should represent the fee-to-liquidity ratio).
 * - Otherwise, compute the yield as fees_24h divided by the pool liquidity.
 *
 * Pools with zero (or non-positive) liquidity return a yield of 0.
 */
function getPoolYield(pool: Pool): number {
    const liquidity = parseFloat(pool.liquidity);
    if (liquidity <= 0) return 0;

    if (pool.fee_tvl_ratio && typeof pool.fee_tvl_ratio.hour_24 === 'number' && pool.fee_tvl_ratio.hour_24 > 0) {
        return pool.fee_tvl_ratio.hour_24;
    }

    return pool.fees_24h / liquidity;
}

/**
 * Select the best pool based on the highest yield.
 *
 * This criterion rewards pools that provide the highest fee return relative to their liquidity.
 */
function selectBestPool(pools: Pool[]): Pool | null {
    let bestPool: Pool | null = null;
    let bestYield = -Infinity;

    for (const pool of pools) {
        const liquidity = parseFloat(pool.liquidity);
        if (liquidity <= 0) continue; // Skip pools with no liquidity

        const poolYield = getPoolYield(pool);
        if (poolYield > bestYield) {
            bestYield = poolYield;
            bestPool = pool;
        }
    }

    return bestPool;
}

/**
 * Main function: fetch all pair data, select the best pool,
 * and output its details in the requested format.
 */
async function scanPoolsAndReport(): Promise<void> {
    const pairs: Pool[] = await fetchAllPairs();

    if (pairs.length === 0) {
        console.log('No pairs retrieved.');
        return;
    }

    const bestPool: Pool | null = selectBestPool(pairs);
    if (!bestPool) {
        console.log('No best pool identified.');
        return;
    }

    // Output the best pool details.
    console.log('--- Best Pool ---');
    console.log(`Pool: ${bestPool.name}`);
    console.log(`Bin Step: ${bestPool.bin_step}`);
    console.log(`Base Fee: ${bestPool.base_fee_percentage}`);
    console.log(`24 hr Fee/TVL: ${bestPool.fees_24h}`);
    console.log('-----------------');
}
scanPoolsAndReport()