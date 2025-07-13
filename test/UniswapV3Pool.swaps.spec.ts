import { Decimal } from 'decimal.js'
import { ContractTransactionResponse } from 'ethers'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { MockTimeUniswapV3Pool } from '../typechain-types/test/MockTimeUniswapV3Pool'
import { TestERC20 } from '../typechain-types/test/TestERC20'
import { TestUniswapV3Callee } from '../typechain-types/test/TestUniswapV3Callee'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { formatPrice, formatTokenAmount } from './shared/format'
import {
  createPoolFunctions,
  encodePriceSqrt,
  expandTo18Decimals,
  FeeAmount,
  getMaxLiquidityPerTick,
  getMaxTick,
  getMinTick,
  MAX_SQRT_RATIO,
  MaxUint128,
  MIN_SQRT_RATIO,
  TICK_SPACINGS,
} from './shared/utilities'

Decimal.config({ toExpNeg: -500, toExpPos: 500 })

const { MaxUint256, ZeroAddress } = ethers

interface BaseSwapTestCase {
  zeroForOne: boolean
  sqrtPriceLimit?: bigint
}
interface SwapExact0For1TestCase extends BaseSwapTestCase {
  zeroForOne: true
  exactOut: false
  amount0: bigint
  sqrtPriceLimit?: bigint
}
interface SwapExact1For0TestCase extends BaseSwapTestCase {
  zeroForOne: false
  exactOut: false
  amount1: bigint
  sqrtPriceLimit?: bigint
}
interface Swap0ForExact1TestCase extends BaseSwapTestCase {
  zeroForOne: true
  exactOut: true
  amount1: bigint
  sqrtPriceLimit?: bigint
}
interface Swap1ForExact0TestCase extends BaseSwapTestCase {
  zeroForOne: false
  exactOut: true
  amount0: bigint
  sqrtPriceLimit?: bigint
}
interface SwapToHigherPrice extends BaseSwapTestCase {
  zeroForOne: false
  sqrtPriceLimit: bigint
}
interface SwapToLowerPrice extends BaseSwapTestCase {
  zeroForOne: true
  sqrtPriceLimit: bigint
}
type SwapTestCase =
  | SwapExact0For1TestCase
  | Swap0ForExact1TestCase
  | SwapExact1For0TestCase
  | Swap1ForExact0TestCase
  | SwapToHigherPrice
  | SwapToLowerPrice

function swapCaseToDescription(testCase: SwapTestCase): string {
  const priceClause = testCase?.sqrtPriceLimit ? ` to price ${formatPrice(testCase.sqrtPriceLimit)}` : ''
  if ('exactOut' in testCase) {
    if (testCase.exactOut) {
      if (testCase.zeroForOne) {
        return `swap token0 for exactly ${formatTokenAmount(testCase.amount1)} token1${priceClause}`
      } else {
        return `swap token1 for exactly ${formatTokenAmount(testCase.amount0)} token0${priceClause}`
      }
    } else {
      if (testCase.zeroForOne) {
        return `swap exactly ${formatTokenAmount(testCase.amount0)} token0 for token1${priceClause}`
      } else {
        return `swap exactly ${formatTokenAmount(testCase.amount1)} token1 for token0${priceClause}`
      }
    }
  } else {
    if (testCase.zeroForOne) {
      return `swap token0 for token1${priceClause}`
    } else {
      return `swap token1 for token0${priceClause}`
    }
  }
}

type PoolFunctions = ReturnType<typeof createPoolFunctions>

// can't use address zero because the ERC20 token does not allow it
const SWAP_RECIPIENT_ADDRESS = ZeroAddress.slice(0, -1) + '1'
const POSITION_PROCEEDS_OUTPUT_ADDRESS = ZeroAddress.slice(0, -1) + '2'

async function executeSwap(
  pool: MockTimeUniswapV3Pool,
  testCase: SwapTestCase,
  poolFunctions: PoolFunctions
): Promise<ContractTransactionResponse> {
  let swap: ContractTransactionResponse
  if ('exactOut' in testCase) {
    if (testCase.exactOut) {
      if (testCase.zeroForOne) {
        swap = await poolFunctions.swap0ForExact1(testCase.amount1, SWAP_RECIPIENT_ADDRESS, testCase.sqrtPriceLimit)
      } else {
        swap = await poolFunctions.swap1ForExact0(testCase.amount0, SWAP_RECIPIENT_ADDRESS, testCase.sqrtPriceLimit)
      }
    } else {
      if (testCase.zeroForOne) {
        swap = await poolFunctions.swapExact0For1(testCase.amount0, SWAP_RECIPIENT_ADDRESS, testCase.sqrtPriceLimit)
      } else {
        swap = await poolFunctions.swapExact1For0(testCase.amount1, SWAP_RECIPIENT_ADDRESS, testCase.sqrtPriceLimit)
      }
    }
  } else {
    if (testCase.zeroForOne) {
      swap = await poolFunctions.swapToLowerPrice(testCase.sqrtPriceLimit, SWAP_RECIPIENT_ADDRESS)
    } else {
      swap = await poolFunctions.swapToHigherPrice(testCase.sqrtPriceLimit, SWAP_RECIPIENT_ADDRESS)
    }
  }
  return swap
}

const DEFAULT_POOL_SWAP_TESTS: SwapTestCase[] = [
  // swap large amounts in/out
  {
    zeroForOne: true,
    exactOut: false,
    amount0: expandTo18Decimals(1n),
  },
  {
    zeroForOne: false,
    exactOut: false,
    amount1: expandTo18Decimals(1n),
  },
  {
    zeroForOne: true,
    exactOut: true,
    amount1: expandTo18Decimals(1n),
  },
  {
    zeroForOne: false,
    exactOut: true,
    amount0: expandTo18Decimals(1n),
  },
  // swap large amounts in/out with a price limit
  {
    zeroForOne: true,
    exactOut: false,
    amount0: expandTo18Decimals(1n),
    sqrtPriceLimit: encodePriceSqrt(50n, 100n),
  },
  {
    zeroForOne: false,
    exactOut: false,
    amount1: expandTo18Decimals(1n),
    sqrtPriceLimit: encodePriceSqrt(200n, 100n),
  },
  {
    zeroForOne: true,
    exactOut: true,
    amount1: expandTo18Decimals(1n),
    sqrtPriceLimit: encodePriceSqrt(50n, 100n),
  },
  {
    zeroForOne: false,
    exactOut: true,
    amount0: expandTo18Decimals(1n),
    sqrtPriceLimit: encodePriceSqrt(200n, 100n),
  },
  // swap small amounts in/out
  {
    zeroForOne: true,
    exactOut: false,
    amount0: 1000n,
  },
  {
    zeroForOne: false,
    exactOut: false,
    amount1: 1000n,
  },
  {
    zeroForOne: true,
    exactOut: true,
    amount1: 1000n,
  },
  {
    zeroForOne: false,
    exactOut: true,
    amount0: 1000n,
  },
  // swap arbitrary input to price
  {
    sqrtPriceLimit: encodePriceSqrt(5n, 2n),
    zeroForOne: false,
  },
  {
    sqrtPriceLimit: encodePriceSqrt(2n, 5n),
    zeroForOne: true,
  },
  {
    sqrtPriceLimit: encodePriceSqrt(5n, 2n),
    zeroForOne: true,
  },
  {
    sqrtPriceLimit: encodePriceSqrt(2n, 5n),
    zeroForOne: false,
  },
]

interface Position {
  tickLower: number
  tickUpper: number
  liquidity: bigint
}

interface PoolTestCase {
  description: string
  feeAmount: number
  tickSpacing: number
  startingPrice: bigint
  positions: Position[]
  swapTests?: SwapTestCase[]
}

const TEST_POOLS: PoolTestCase[] = [
  {
    description: 'low fee, 1:1 price, 2e18 max range liquidity',
    feeAmount: FeeAmount.LOW,
    tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.LOW])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.LOW])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, 1:1 price, 2e18 max range liquidity',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'high fee, 1:1 price, 2e18 max range liquidity',
    feeAmount: FeeAmount.HIGH,
    tickSpacing: TICK_SPACINGS[FeeAmount.HIGH],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.HIGH])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.HIGH])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, 10:1 price, 2e18 max range liquidity',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(10n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, 1:10 price, 2e18 max range liquidity',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 10n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, 1:1 price, 0 liquidity, all liquidity around current price',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: -Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: expandTo18Decimals(2n),
      },
      {
        tickLower: Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, 1:1 price, additional liquidity around current price',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: -Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: expandTo18Decimals(2n),
      },
      {
        tickLower: Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'low fee, large liquidity around current price (stable swap)',
    feeAmount: FeeAmount.LOW,
    tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: -Number(TICK_SPACINGS[FeeAmount.LOW]),
        tickUpper: Number(TICK_SPACINGS[FeeAmount.LOW]),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, token0 liquidity only',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: 0,
        tickUpper: 2000 * Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'medium fee, token1 liquidity only',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: -2000 * Number(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: 0,
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'close to max price',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(2n ** 127n, 1n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'close to min price',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 2n ** 127n),
    positions: [
      {
        tickLower: getMinTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        tickUpper: getMaxTick(Number(TICK_SPACINGS[FeeAmount.MEDIUM])),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'max full range liquidity at 1:1 price with default fee',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: encodePriceSqrt(1n, 1n),
    positions: [
      {
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: getMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
      },
    ],
  },
  {
    description: 'initialized at the max ratio',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: MAX_SQRT_RATIO - 1n,
    positions: [
      {
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
  {
    description: 'initialized at the min ratio',
    feeAmount: FeeAmount.MEDIUM,
    tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
    startingPrice: MIN_SQRT_RATIO,
    positions: [
      {
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        liquidity: expandTo18Decimals(2n),
      },
    ],
  },
]

describe('UniswapV3Pool swap tests', () => {
  let wallet: SignerWithAddress, other: SignerWithAddress

  before('get signers', async () => {
    ;[wallet, other] = await (ethers as any).getSigners()
  })

  for (const poolCase of TEST_POOLS) {
    describe(poolCase.description, () => {
      const poolCaseFixture = async () => {
        const { createPool, token0, token1, swapTargetCallee: swapTarget } = await poolFixture()
        const pool = await createPool(poolCase.feeAmount, poolCase.tickSpacing)
        const poolFunctions = createPoolFunctions({ swapTarget, token0, token1, pool })
        await pool.initialize(poolCase.startingPrice)
        // mint all positions
        for (const position of poolCase.positions) {
          await poolFunctions.mint(wallet.address, position.tickLower, position.tickUpper, position.liquidity)
        }

        const [poolBalance0, poolBalance1] = await Promise.all([
          token0.balanceOf(await pool.getAddress()),
          token1.balanceOf(await pool.getAddress()),
        ])

        return { token0, token1, pool, poolFunctions, poolBalance0, poolBalance1, swapTarget }
      }

      let token0: TestERC20
      let token1: TestERC20

      let poolBalance0: bigint
      let poolBalance1: bigint

      let pool: MockTimeUniswapV3Pool
      let swapTarget: TestUniswapV3Callee
      let poolFunctions: PoolFunctions

      beforeEach('load fixture', async () => {
        ;({ token0, token1, pool, poolFunctions, poolBalance0, poolBalance1, swapTarget } = await poolCaseFixture())
      })

      afterEach('check can burn positions', async () => {
        for (const { liquidity, tickUpper, tickLower } of poolCase.positions) {
          await pool.burn(tickLower, tickUpper, liquidity)
          await pool.collect(POSITION_PROCEEDS_OUTPUT_ADDRESS, tickLower, tickUpper, MaxUint128, MaxUint128)
        }
      })

      for (const testCase of poolCase.swapTests ?? DEFAULT_POOL_SWAP_TESTS) {
        it(swapCaseToDescription(testCase), async () => {
          const slot0 = await pool.slot0()
          const tx = executeSwap(pool, testCase, poolFunctions)
          try {
            await tx
          } catch (error: any) {
            expect({
              swapError: error.message,
              poolBalance0: poolBalance0.toString(),
              poolBalance1: poolBalance1.toString(),
              poolPriceBefore: formatPrice(slot0.sqrtPriceX96),
              tickBefore: slot0.tick,
            }).to.matchSnapshot('swap error')
            return
          }
          const [
            poolBalance0After,
            poolBalance1After,
            slot0After,
            liquidityAfter,
            feeGrowthGlobal0X128,
            feeGrowthGlobal1X128,
          ] = await Promise.all([
            token0.balanceOf(await pool.getAddress()),
            token1.balanceOf(await pool.getAddress()),
            pool.slot0(),
            pool.liquidity(),
            pool.feeGrowthGlobal0X128(),
            pool.feeGrowthGlobal1X128(),
          ])
          const poolBalance0Delta = BigInt(poolBalance0After.toString()) - BigInt(poolBalance0.toString())
          const poolBalance1Delta = BigInt(poolBalance1After.toString()) - BigInt(poolBalance1.toString())

          // check all the events were emitted corresponding to balance changes
          if (poolBalance0Delta === 0n) await expect(tx).to.not.emit(token0, 'Transfer')
          else if (poolBalance0Delta < 0n)
            await expect(tx)
              .to.emit(token0, 'Transfer')
              .withArgs(await pool.getAddress(), SWAP_RECIPIENT_ADDRESS, poolBalance0Delta * -1n)
          else await expect(tx).to.emit(token0, 'Transfer').withArgs(wallet.address, await pool.getAddress(), poolBalance0Delta)

          if (poolBalance1Delta === 0n) await expect(tx).to.not.emit(token1, 'Transfer')
          else if (poolBalance1Delta < 0n)
            await expect(tx)
              .to.emit(token1, 'Transfer')
              .withArgs(await pool.getAddress(), SWAP_RECIPIENT_ADDRESS, poolBalance1Delta * -1n)
          else await expect(tx).to.emit(token1, 'Transfer').withArgs(wallet.address, await pool.getAddress(), poolBalance1Delta)

          // check that the swap event was emitted too
          await expect(tx)
            .to.emit(pool, 'Swap')
            .withArgs(
              await swapTarget.getAddress(),
              SWAP_RECIPIENT_ADDRESS,
              poolBalance0Delta,
              poolBalance1Delta,
              slot0After.sqrtPriceX96,
              liquidityAfter,
              slot0After.tick
            )

          const executionPrice = new Decimal(poolBalance1Delta.toString()).div(poolBalance0Delta.toString()).mul(-1)

          expect({
            amount0Before: poolBalance0.toString(),
            amount1Before: poolBalance1.toString(),
            amount0Delta: poolBalance0Delta.toString(),
            amount1Delta: poolBalance1Delta.toString(),
            feeGrowthGlobal0X128Delta: feeGrowthGlobal0X128.toString(),
            feeGrowthGlobal1X128Delta: feeGrowthGlobal1X128.toString(),
            tickBefore: slot0.tick,
            poolPriceBefore: formatPrice(slot0.sqrtPriceX96),
            tickAfter: slot0After.tick,
            poolPriceAfter: formatPrice(slot0After.sqrtPriceX96),
            executionPrice: executionPrice.toPrecision(5),
          }).to.matchSnapshot('balances')
        })
      }
    })
  }
})
