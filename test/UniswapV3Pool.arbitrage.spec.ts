import Decimal from 'decimal.js'
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import { ethers } from 'hardhat'
import { MockTimeUniswapV3Pool } from '../typechain-types/test/MockTimeUniswapV3Pool'
import { TickMathTest } from '../typechain-types/test/TickMathTest'
import { UniswapV3PoolSwapTest } from '../typechain-types/test/UniswapV3PoolSwapTest'
import { expect } from 'chai'

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
  MintFunction,
  SwapFunction,
  TICK_SPACINGS,
} from './shared/utilities'

const MaxUint256 = ethers.MaxUint256

Decimal.config({ toExpNeg: -500, toExpPos: 500 })

function applySqrtRatioBipsHundredthsDelta(sqrtRatio: bigint, bipsHundredths: number): bigint {
  return BigInt(
    new Decimal(
      ((sqrtRatio * sqrtRatio * BigInt(1e6 + bipsHundredths)) / BigInt(1e6)).toString()
    )
      .sqrt()
      .floor()
      .toString()
  )
}

describe('UniswapV3Pool arbitrage tests', () => {
  let wallet: HardhatEthersSigner, arbitrageur: HardhatEthersSigner

  before('get signers', async () => {
    ;[wallet, arbitrageur] = await ethers.getSigners()
  })

  for (const feeProtocol of [0, 6]) {
    describe(`protocol fee = ${feeProtocol};`, () => {
      const startingPrice = encodePriceSqrt(1n, 1n)
      const startingTick = 0n
      const feeAmount = FeeAmount.MEDIUM
      const tickSpacing = TICK_SPACINGS[feeAmount]
      const minTick = getMinTick(tickSpacing)
      const maxTick = getMaxTick(tickSpacing)

      for (const passiveLiquidity of [
        expandTo18Decimals(1n) / 100n,
        expandTo18Decimals(1n),
        expandTo18Decimals(10n),
        expandTo18Decimals(100n),
      ]) {
        describe(`passive liquidity of ${formatTokenAmount(passiveLiquidity)}`, () => {
          const arbTestFixture = async () => {
            const fix = await poolFixture()

            const pool = await fix.createPool(feeAmount, tickSpacing)

            await fix.token0.transfer(await arbitrageur.getAddress(), 2n ** 254n)
            await fix.token1.transfer(await arbitrageur.getAddress(), 2n ** 254n)

            const {
              swapExact0For1,
              swapToHigherPrice,
              swapToLowerPrice,
              swapExact1For0,
              mint,
            } = await createPoolFunctions({
              swapTarget: fix.swapTargetCallee,
              token0: fix.token0,
              token1: fix.token1,
              pool,
            })

            const testerFactory = await ethers.getContractFactory('UniswapV3PoolSwapTest')
            const tester = (await testerFactory.deploy()) as UniswapV3PoolSwapTest

            const tickMathFactory = await ethers.getContractFactory('TickMathTest')
            const tickMath = (await tickMathFactory.deploy()) as TickMathTest

            await fix.token0.approve(tester.getAddress(), MaxUint256)
            await fix.token1.approve(tester.getAddress(), MaxUint256)

            await pool.initialize(startingPrice)
            if (feeProtocol != 0) await pool.setFeeProtocol(feeProtocol, feeProtocol)
            await mint(wallet.address, minTick, maxTick, passiveLiquidity)

            expect((await pool.slot0()).tick).to.eq(startingTick)
            expect((await pool.slot0()).sqrtPriceX96).to.eq(startingPrice)

            return { pool, swapExact0For1, mint, swapToHigherPrice, swapToLowerPrice, swapExact1For0, tester, tickMath }
          }

          let swapExact0For1: SwapFunction
          let swapToHigherPrice: SwapFunction
          let swapToLowerPrice: SwapFunction
          let swapExact1For0: SwapFunction
          let pool: MockTimeUniswapV3Pool
          let mint: MintFunction
          let tester: UniswapV3PoolSwapTest
          let tickMath: TickMathTest

          beforeEach('load the fixture', async () => {
            ;({
              swapExact0For1,
              pool,
              mint,
              swapToHigherPrice,
              swapToLowerPrice,
              swapExact1For0,
              tester,
              tickMath,
            } = await arbTestFixture())
          })

          async function simulateSwap(
            zeroForOne: boolean,
            amountSpecified: bigint,
            sqrtPriceLimitX96?: bigint
          ): Promise<{
            executionPrice: bigint
            nextSqrtRatio: bigint
            amount0Delta: bigint
            amount1Delta: bigint
          }> {
            const { amount0Delta, amount1Delta, nextSqrtRatio } = await tester.getSwapResult.staticCall(
              await pool.getAddress(),
              zeroForOne,
              amountSpecified,
              sqrtPriceLimitX96 ?? (zeroForOne ? MIN_SQRT_RATIO + 1n : MAX_SQRT_RATIO - 1n)
            )

            const executionPrice = zeroForOne
              ? encodePriceSqrt(amount1Delta, -amount0Delta)
              : encodePriceSqrt(-amount1Delta, amount0Delta)

            return { executionPrice, nextSqrtRatio, amount0Delta, amount1Delta }
          }

          for (const { zeroForOne, assumedTruePriceAfterSwap, inputAmount, description } of [
            {
              description: 'exact input of 10e18 token0 with starting price of 1.0 and true price of 0.98',
              zeroForOne: true,
              inputAmount: expandTo18Decimals(10n),
              assumedTruePriceAfterSwap: encodePriceSqrt(98n, 100n),
            },
            {
              description: 'exact input of 10e18 token0 with starting price of 1.0 and true price of 1.01',
              zeroForOne: true,
              inputAmount: expandTo18Decimals(10n),
              assumedTruePriceAfterSwap: encodePriceSqrt(101n, 100n),
            },
          ]) {
            describe(description, () => {
              function valueToken1(arbBalance0: bigint, arbBalance1: bigint): bigint {
                return (assumedTruePriceAfterSwap * assumedTruePriceAfterSwap * arbBalance0) / (2n ** 192n) + arbBalance1
              }

              it('not sandwiched', async () => {
                const { executionPrice, amount1Delta, amount0Delta } = await simulateSwap(zeroForOne, inputAmount)
                zeroForOne
                  ? await swapExact0For1(inputAmount, wallet.address)
                  : await swapExact1For0(inputAmount, wallet.address)

                expect({
                  executionPrice: formatPrice(executionPrice),
                  amount0Delta: formatTokenAmount(amount0Delta),
                  amount1Delta: formatTokenAmount(amount1Delta),
                  priceAfter: formatPrice((await pool.slot0()).sqrtPriceX96),
                }).to.matchSnapshot()
              })

              it('sandwiched with swap to execution price then mint max liquidity/target/burn max liquidity', async () => {
                const { executionPrice } = await simulateSwap(zeroForOne, BigInt(inputAmount))

                const firstTickAboveMarginalPrice = zeroForOne
                  ? Math.ceil(
                      Number((await tickMath.getTickAtSqrtRatio(
                        applySqrtRatioBipsHundredthsDelta(executionPrice, feeAmount)
                      )) / BigInt(tickSpacing))
                    ) * tickSpacing
                  : Math.floor(
                      Number((await tickMath.getTickAtSqrtRatio(
                        applySqrtRatioBipsHundredthsDelta(executionPrice, -feeAmount)
                      )) / BigInt(tickSpacing))
                    ) * tickSpacing
                const tickAfterFirstTickAboveMarginPrice = zeroForOne
                  ? firstTickAboveMarginalPrice - tickSpacing
                  : firstTickAboveMarginalPrice + tickSpacing

                const priceSwapStart = await tickMath.getSqrtRatioAtTick(firstTickAboveMarginalPrice)

                let arbBalance0 = 0n
                let arbBalance1 = 0n

                // first frontrun to the first tick before the execution price
                const {
                  amount0Delta: frontrunDelta0,
                  amount1Delta: frontrunDelta1,
                  executionPrice: frontrunExecutionPrice,
                } = await simulateSwap(zeroForOne, MaxUint256 / 2n, priceSwapStart)
                arbBalance0 = arbBalance0 - frontrunDelta0
                arbBalance1 = arbBalance1 - frontrunDelta1

                zeroForOne
                  ? await swapToLowerPrice(priceSwapStart, arbitrageur.address)
                  : await swapToHigherPrice(priceSwapStart, arbitrageur.address)

                const profitToken1AfterFrontRun = valueToken1(arbBalance0, arbBalance1)

                const tickLower = zeroForOne ? tickAfterFirstTickAboveMarginPrice : firstTickAboveMarginalPrice
                const tickUpper = zeroForOne ? firstTickAboveMarginalPrice : tickAfterFirstTickAboveMarginPrice

                // deposit max liquidity at the tick
                const mintReceipt = await (
                  await mint(wallet.address, tickLower, tickUpper, getMaxLiquidityPerTick(tickSpacing))
                ).wait()
                // sub the mint costs
                const { amount0: amount0Mint, amount1: amount1Mint } = pool.interface.decodeEventLog(
                  pool.interface.getEvent('Mint'),
                  mintReceipt!.logs![2].data
                )
                arbBalance0 = arbBalance0 - amount0Mint
                arbBalance1 = arbBalance1 - amount1Mint

                // execute the user's swap
                const { executionPrice: executionPriceAfterFrontrun } = await simulateSwap(zeroForOne, inputAmount)
                zeroForOne
                  ? await swapExact0For1(inputAmount, wallet.address)
                  : await swapExact1For0(inputAmount, wallet.address)

                // burn the arb's liquidity
                const { amount0: amount0Burn, amount1: amount1Burn } = await pool.burn.staticCall(
                  tickLower,
                  tickUpper,
                  getMaxLiquidityPerTick(tickSpacing)
                )
                await pool.burn(tickLower, tickUpper, getMaxLiquidityPerTick(tickSpacing))
                arbBalance0 = arbBalance0 + amount0Burn
                arbBalance1 = arbBalance1 + amount1Burn

                // add the fees as well
                const {
                  amount0: amount0CollectAndBurn,
                  amount1: amount1CollectAndBurn,
                } = await pool.collect.staticCall(arbitrageur.address, tickLower, tickUpper, MaxUint128, MaxUint128)
                const [amount0Collect, amount1Collect] = [
                  amount0CollectAndBurn - amount0Burn,
                  amount1CollectAndBurn - amount1Burn,
                ]
                arbBalance0 = arbBalance0 + amount0Collect
                arbBalance1 = arbBalance1 + amount1Collect

                const profitToken1AfterSandwich = valueToken1(arbBalance0, arbBalance1)

                // backrun the swap to true price, i.e. swap to the marginal price = true price
                const priceToSwapTo = zeroForOne
                  ? applySqrtRatioBipsHundredthsDelta(assumedTruePriceAfterSwap, -feeAmount)
                  : applySqrtRatioBipsHundredthsDelta(assumedTruePriceAfterSwap, feeAmount)
                const {
                  amount0Delta: backrunDelta0,
                  amount1Delta: backrunDelta1,
                  executionPrice: backrunExecutionPrice,
                } = await simulateSwap(!zeroForOne, MaxUint256 / 2n, priceToSwapTo)
                await swapToHigherPrice(priceToSwapTo, wallet.address)
                arbBalance0 = arbBalance0 - backrunDelta0
                arbBalance1 = arbBalance1 - backrunDelta1

                expect({
                  sandwichedPrice: formatPrice(executionPriceAfterFrontrun),
                  arbBalanceDelta0: formatTokenAmount(arbBalance0),
                  arbBalanceDelta1: formatTokenAmount(arbBalance1),
                  profit: {
                    final: formatTokenAmount(valueToken1(arbBalance0, arbBalance1)),
                    afterFrontrun: formatTokenAmount(profitToken1AfterFrontRun),
                    afterSandwich: formatTokenAmount(profitToken1AfterSandwich),
                  },
                  backrun: {
                    executionPrice: formatPrice(backrunExecutionPrice),
                    delta0: formatTokenAmount(backrunDelta0),
                    delta1: formatTokenAmount(backrunDelta1),
                  },
                  frontrun: {
                    executionPrice: formatPrice(frontrunExecutionPrice),
                    delta0: formatTokenAmount(frontrunDelta0),
                    delta1: formatTokenAmount(frontrunDelta1),
                  },
                  collect: {
                    amount0: formatTokenAmount(amount0Collect),
                    amount1: formatTokenAmount(amount1Collect),
                  },
                  burn: {
                    amount0: formatTokenAmount(amount0Burn),
                    amount1: formatTokenAmount(amount1Burn),
                  },
                  mint: {
                    amount0: formatTokenAmount(amount0Mint),
                    amount1: formatTokenAmount(amount1Mint),
                  },
                  finalPrice: formatPrice((await pool.slot0()).sqrtPriceX96),
                }).to.matchSnapshot()
              })

              it('backrun to true price after swap only', async () => {
                let arbBalance0 = 0n
                let arbBalance1 = 0n

                zeroForOne
                  ? await swapExact0For1(inputAmount, wallet.address)
                  : await swapExact1For0(inputAmount, wallet.address)

                // swap to the marginal price = true price
                const priceToSwapTo = zeroForOne
                  ? applySqrtRatioBipsHundredthsDelta(assumedTruePriceAfterSwap, -feeAmount)
                  : applySqrtRatioBipsHundredthsDelta(assumedTruePriceAfterSwap, feeAmount)
                const {
                  amount0Delta: backrunDelta0,
                  amount1Delta: backrunDelta1,
                  executionPrice: backrunExecutionPrice,
                } = await simulateSwap(!zeroForOne, MaxUint256 / 2n, priceToSwapTo)
                zeroForOne
                  ? await swapToHigherPrice(priceToSwapTo, wallet.address)
                  : await swapToLowerPrice(priceToSwapTo, wallet.address)
                arbBalance0 = arbBalance0 - backrunDelta0
                arbBalance1 = arbBalance1 - backrunDelta1

                expect({
                  arbBalanceDelta0: formatTokenAmount(arbBalance0),
                  arbBalanceDelta1: formatTokenAmount(arbBalance1),
                  profit: {
                    final: formatTokenAmount(valueToken1(arbBalance0, arbBalance1)),
                  },
                  backrun: {
                    executionPrice: formatPrice(backrunExecutionPrice),
                    delta0: formatTokenAmount(backrunDelta0),
                    delta1: formatTokenAmount(backrunDelta1),
                  },
                  finalPrice: formatPrice((await pool.slot0()).sqrtPriceX96),
                }).to.matchSnapshot()
              })
            })
          }
        })
      }
    })
  }
})
