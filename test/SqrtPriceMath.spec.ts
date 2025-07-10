import { ethers } from 'hardhat'
import { SqrtPriceMathTest } from '../typechain-types/test/SqrtPriceMathTest'
import { MaxUint256, Wallet } from 'ethers'
import { expect } from './shared/expect'
import { encodePriceSqrt, expandTo18Decimals, getWallets, MaxUint128 } from './shared/utilities'



describe('SqrtPriceMath', () => {
  let sqrtPriceMath: SqrtPriceMathTest
  let walletForLargeContract: Wallet
  beforeEach(async () => {
    walletForLargeContract = getWallets(1)[0]
    const sqrtPriceMathTestFactory = await ethers.getContractFactory('SqrtPriceMathTest', walletForLargeContract)
    sqrtPriceMath = await sqrtPriceMathTestFactory.deploy() as SqrtPriceMathTest
    await sqrtPriceMath.waitForDeployment()
  })

  describe('#getNextSqrtPriceFromInput', () => {
    it('fails if price is zero', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromInput(0n, 0n, expandTo18Decimals(1n) / 10n, false)).to.be.reverted
    })

    it('fails if liquidity is zero', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromInput(1n, 0n, expandTo18Decimals(1n) / 10n, true)).to.be.reverted
    })

    it('fails if input amount overflows the price', async () => {
      const price = 2n ** 160n - 1n
      const liquidity = 1024n
      const amountIn = 1024n
      await expect(sqrtPriceMath.getNextSqrtPriceFromInput(price, liquidity, amountIn, false)).to.be.reverted
    })

    it('any input amount cannot underflow the price', async () => {
      const price = 1n
      const liquidity = 1n
      const amountIn = 2n ** 255n
      expect(await sqrtPriceMath.getNextSqrtPriceFromInput(price, liquidity, amountIn, true)).to.eq(1n)
    })

    it('returns input price if amount in is zero and zeroForOne = true', async () => {
      const price = encodePriceSqrt(1n, 1n)
      expect(await sqrtPriceMath.getNextSqrtPriceFromInput(price, expandTo18Decimals(1n) / 10n, 0n, true)).to.eq(price)
    })

    it('returns input price if amount in is zero and zeroForOne = false', async () => {
      const price = encodePriceSqrt(1n, 1n)
      expect(await sqrtPriceMath.getNextSqrtPriceFromInput(price, expandTo18Decimals(1n) / 10n, 0n, false)).to.eq(price)
    })

    it('returns the minimum price for max inputs', async () => {
      const sqrtP = 2n ** 160n - 1n
      const liquidity = MaxUint128
      const maxAmountNoOverflow = MaxUint256 - (liquidity * (2n ** 96n)) / sqrtP
      expect(await sqrtPriceMath.getNextSqrtPriceFromInput(sqrtP, liquidity, maxAmountNoOverflow, true)).to.eq(1n)
    })

    it('input amount of 0.1 token1', async () => {
      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromInput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1n),
        expandTo18Decimals(1n) / 10n,
        false
      )
      expect(sqrtQ).to.eq(87150978765690771352898345369n)
    })

    it('input amount of 0.1 token0', async () => {
      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromInput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1n),
        expandTo18Decimals(1n) / 10n,
        true
      )
      expect(sqrtQ).to.eq(72025602285694852357767227579n)
    })

    it('amountIn > type(uint96).max and zeroForOne = true', async () => {
      expect(
        await sqrtPriceMath.getNextSqrtPriceFromInput(
          encodePriceSqrt(1n, 1n),
          expandTo18Decimals(10n),
          2n ** 100n,
          true
        )
      ).to.eq(624999999995069620n)
    })

    it('can return 1 with enough amountIn and zeroForOne = true', async () => {
      expect(
        await sqrtPriceMath.getNextSqrtPriceFromInput(encodePriceSqrt(1n, 1n), 1n, MaxUint256 / 2n, true)
      ).to.eq(1n)
    })

    // it('zeroForOne = true gas', async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetNextSqrtPriceFromInput(
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       expandTo18Decimals(1n) / 10n,
    //       true
    //     )
    //   )
    // })

    // it('zeroForOne = false gas', async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetNextSqrtPriceFromInput(
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       expandTo18Decimals(1n) / 10n,
    //       false
    //     )
    //   )
    // })
  })

  describe('#getNextSqrtPriceFromOutput', () => {
    it('fails if price is zero', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(0n, 0n, expandTo18Decimals(1n) / 10n, false)).to.be.reverted
    })

    it('fails if liquidity is zero', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(1n, 0n, expandTo18Decimals(1n) / 10n, true)).to.be.reverted
    })

    it('fails if output amount is exactly the virtual reserves of token0', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 4n
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).to.be.reverted
    })

    it('fails if output amount is greater than virtual reserves of token0', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 5n
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).to.be.reverted
    })

    it('fails if output amount is greater than virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 262145n
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true)).to.be.reverted
    })

    it('fails if output amount is exactly the virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 262144n
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true)).to.be.reverted
    })

    it('succeeds if output amount is just less than the virtual reserves of token1', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 262143n
      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, true)
      expect(sqrtQ).to.eq(77371252455336267181195264n)
    })

    it('puzzling echidna test', async () => {
      const price = 20282409603651670423947251286016n
      const liquidity = 1024n
      const amountOut = 4n

      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(price, liquidity, amountOut, false)).to.be.reverted
    })

    it('returns input price if amount in is zero and zeroForOne = true', async () => {
      const price = encodePriceSqrt(1n, 1n)
      expect(await sqrtPriceMath.getNextSqrtPriceFromOutput(price, expandTo18Decimals(1n) / 10n, 0n, true)).to.eq(price)
    })

    it('returns input price if amount in is zero and zeroForOne = false', async () => {
      const price = encodePriceSqrt(1n, 1n)
      expect(await sqrtPriceMath.getNextSqrtPriceFromOutput(price, expandTo18Decimals(1n) / 10n, 0n, false)).to.eq(price)
    })

    it('output amount of 0.1 token1', async () => {
      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromOutput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1n),
        expandTo18Decimals(1n) / 10n,
        false
      )
      expect(sqrtQ).to.eq(88031291682515930659493278152n)
    })

    it('output amount of 0.1 token1', async () => {
      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromOutput(
        encodePriceSqrt(1n, 1n),
        expandTo18Decimals(1n),
        expandTo18Decimals(1n) / 10n,
        true
      )
      expect(sqrtQ).to.eq(71305346262837903834189555302n)
    })

    it('reverts if amountOut is impossible in zero for one direction', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(encodePriceSqrt(1n, 1n), 1n, MaxUint256, true)).to.be.reverted
    })

    it('reverts if amountOut is impossible in one for zero direction', async () => {
      await expect(sqrtPriceMath.getNextSqrtPriceFromOutput(encodePriceSqrt(1n, 1n), 1n, MaxUint256, false)).to.be.reverted
    })

    // it('zeroForOne = true gas', async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetNextSqrtPriceFromOutput(
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       expandTo18Decimals(1n) / 10n,
    //       true
    //     )
    //   )
    // })

    // it('zeroForOne = false gas', async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetNextSqrtPriceFromOutput(
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       expandTo18Decimals(1n) / 10n,
    //       false
    //     )
    //   )
    // })
  })

  describe('#getAmount0Delta', () => {
    it('returns 0 if liquidity is 0', async () => {
      const amount0 = await sqrtPriceMath.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n, true)
      expect(amount0).to.eq(0n)
    })

    it('returns 0 if prices are equal', async () => {
      const amount0 = await sqrtPriceMath.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(1n, 1n), 0n, true)
      expect(amount0).to.eq(0n)
    })

    it('returns 0.1 amount1 for price of 1 to 1.21', async () => {
      const amount0 = await sqrtPriceMath.getAmount0Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1n),
        true
      )
      expect(amount0).to.eq(90909090909090910n)

      const amount0RoundedDown = await sqrtPriceMath.getAmount0Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1n),
        false
      )

      expect(amount0RoundedDown).to.eq(amount0 - 1n)
    })

    it('works for prices that overflow', async () => {
      const amount0Up = await sqrtPriceMath.getAmount0Delta(
        encodePriceSqrt(2n ** 90n, 1n),
        encodePriceSqrt(2n ** 96n, 1n),
        expandTo18Decimals(1n),
        true
      )
      const amount0Down = await sqrtPriceMath.getAmount0Delta(
        encodePriceSqrt(2n ** 90n, 1n),
        encodePriceSqrt(2n ** 96n, 1n),
        expandTo18Decimals(1n),
        false
      )
      expect(amount0Up).to.eq(amount0Down + 1n)
    })

    // it(`gas cost for amount0 where roundUp = true`, async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetAmount0Delta(
    //       encodePriceSqrt(100n, 121n),
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       true
    //     )
    //   )
    // })

    // it('measures gas cost for amount0 where roundUp = false', async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetAmount0Delta(
    //       encodePriceSqrt(100n, 121n),
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       true
    //     )
    //   )
    // })

    // it(`gas cost for amount0 where roundUp = true`, async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetAmount0Delta(
    //       encodePriceSqrt(100, 121),
    //       encodePriceSqrt(1, 1),
    //       expandTo18Decimals(1),
    //       false
    //     )
    //   )
    // })
  })

  describe('#getAmount1Delta', () => {
    it('returns 0 if liquidity is 0', async () => {
      const amount1 = await sqrtPriceMath.getAmount1Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(2n, 1n), 0n, true)
      expect(amount1).to.eq(0n)
    })

    it('returns 0 if prices are equal', async () => {
      const amount1 = await sqrtPriceMath.getAmount0Delta(encodePriceSqrt(1n, 1n), encodePriceSqrt(1n, 1n), 0n, true)
      expect(amount1).to.eq(0n)
    })

    it('returns 0.1 amount1 for price of 1 to 1.21', async () => {
      const amount1 = await sqrtPriceMath.getAmount1Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1n),
        true
      )

      expect(amount1).to.eq(100000000000000000n)
      const amount1RoundedDown = await sqrtPriceMath.getAmount1Delta(
        encodePriceSqrt(1n, 1n),
        encodePriceSqrt(121n, 100n),
        expandTo18Decimals(1n),
        false
      )

      expect(amount1RoundedDown).to.eq(amount1 - 1n)
    })

    // it(`gas cost for amount0 where roundUp = true`, async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetAmount0Delta(
    //       encodePriceSqrt(100n, 121n),
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       true
    //     )
    //   )
    // })

    // it(`gas cost for amount0 where roundUp = false`, async () => {
    //   await snapshotGasCost(
    //     sqrtPriceMath.getGasCostOfGetAmount0Delta(
    //       encodePriceSqrt(100n, 121n),
    //       encodePriceSqrt(1n, 1n),
    //       expandTo18Decimals(1n),
    //       false
    //     )
    //   )
    // })
  })

  describe('swap computation', () => {
    it('sqrtP * sqrtQ overflows', async () => {
      // getNextSqrtPriceInvariants(1025574284609383690408304870162715216695788925244,50015962439936049619261659728067971248,406,true)
      const sqrtP = 1025574284609383690408304870162715216695788925244n
      const liquidity = 50015962439936049619261659728067971248n
      const zeroForOne = true
      const amountIn = 406n

      const sqrtQ = await sqrtPriceMath.getNextSqrtPriceFromInput(sqrtP, liquidity, amountIn, zeroForOne)
      expect(sqrtQ).to.eq(1025574284609383582644711336373707553698163132913n)

      const amount0Delta = await sqrtPriceMath.getAmount0Delta(sqrtQ, sqrtP, liquidity, true)
      expect(amount0Delta).to.eq(406n)
    })
  })
})
