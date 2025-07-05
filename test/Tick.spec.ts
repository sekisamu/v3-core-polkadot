import { ethers } from 'hardhat'
import { TickTest } from '../typechain-types'
import { expect } from './shared/expect'
import { FeeAmount, getMaxLiquidityPerTick, TICK_SPACINGS } from './shared/utilities'
import { MaxUint256 } from 'ethers'

const MaxUint128 = 2n ** 128n - 1n
describe('Tick', () => {
  let tickTest: TickTest

  beforeEach('deploy TickTest', async () => {
    const tickTestFactory = await ethers.getContractFactory('TickTest')
    tickTest = (await tickTestFactory.deploy()) as TickTest
  })

  describe('#tickSpacingToMaxLiquidityPerTick', () => {
    it('returns the correct value for low fee', async () => {
      const maxLiquidityPerTick = await tickTest.tickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.LOW])
      expect(maxLiquidityPerTick).to.eq(1917569901783203986719870431555990n) // 110.8 bits
      expect(maxLiquidityPerTick).to.eq(getMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.LOW]))
    })
    it('returns the correct value for medium fee', async () => {
      const maxLiquidityPerTick = await tickTest.tickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.MEDIUM])
      expect(maxLiquidityPerTick).to.eq(11505743598341114571880798222544994n) // 113.1 bits
      expect(maxLiquidityPerTick).to.eq(getMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.MEDIUM]))
    })
    it('returns the correct value for high fee', async () => {
      const maxLiquidityPerTick = await tickTest.tickSpacingToMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.HIGH])
      expect(maxLiquidityPerTick).to.eq(38350317471085141830651933667504588n) // 114.7 bits
      expect(maxLiquidityPerTick).to.eq(getMaxLiquidityPerTick(TICK_SPACINGS[FeeAmount.HIGH]))
    })
    it('returns the correct value for entire range', async () => {
      const maxLiquidityPerTick = await tickTest.tickSpacingToMaxLiquidityPerTick(887272)
      expect(maxLiquidityPerTick).to.eq(MaxUint128 / 3n) // 126 bits
      expect(maxLiquidityPerTick).to.eq(getMaxLiquidityPerTick(887272))
    })
    it('returns the correct value for 2302', async () => {
      const maxLiquidityPerTick = await tickTest.tickSpacingToMaxLiquidityPerTick(2302)
      expect(maxLiquidityPerTick).to.eq(441351967472034323558203122479595605n) // 118 bits
      expect(maxLiquidityPerTick).to.eq(getMaxLiquidityPerTick(2302))
    })
  })

  describe('#getFeeGrowthInside', () => {
    it('returns all for two uninitialized ticks if tick is inside', async () => {
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 0, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(15n)
      expect(feeGrowthInside1X128).to.eq(15n)
    })
    it('returns 0 for two uninitialized ticks if tick is above', async () => {

      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 4, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(0n)
      expect(feeGrowthInside1X128).to.eq(0n)
    })
    it('returns 0 for two uninitialized ticks if tick is below', async () => {

      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, -4, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(0n)
      expect(feeGrowthInside1X128).to.eq(0n)
    })

    it('subtracts upper tick if below', async () => {

      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 2n,
        feeGrowthOutside1X128: 3n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 0, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(13n)
      expect(feeGrowthInside1X128).to.eq(12n)
    })

    it('subtracts lower tick if above', async () => {

      await tickTest.setTick(-2, {
        feeGrowthOutside0X128: 2n,
        feeGrowthOutside1X128: 3n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 0, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(13n)
      expect(feeGrowthInside1X128).to.eq(12n)
    })

    it('subtracts upper and lower tick if inside', async () => {
      await tickTest.setTick(-2, {
        feeGrowthOutside0X128: 2n,
        feeGrowthOutside1X128: 3n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 4n,
        feeGrowthOutside1X128: 1n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 0, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(9n)
      expect(feeGrowthInside1X128).to.eq(11n)
    })

    it('works correctly with overflow on inside tick', async () => {
      await tickTest.setTick(-2, {
        feeGrowthOutside0X128: MaxUint256 - 3n,
        feeGrowthOutside1X128: MaxUint256 - 2n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 3n,
        feeGrowthOutside1X128: 5n,
        liquidityGross: 0n,
        liquidityNet: 0n,
        secondsPerLiquidityOutsideX128: 0n,
        tickCumulativeOutside: 0n,
        secondsOutside: 0n,
        initialized: true,
      })
      const { feeGrowthInside0X128, feeGrowthInside1X128 } = await tickTest.getFeeGrowthInside(-2, 2, 0, 15n, 15n)
      expect(feeGrowthInside0X128).to.eq(16n)
      expect(feeGrowthInside1X128).to.eq(13n)
    })
  })

  describe('#update', async () => {
    it('flips from zero to nonzero', async () => {
      expect(await tickTest.update.staticCall(0, 0, 1n, 0n, 0n, 0n, 0n, 0n, false, 3n)).to.eq(true)
    })
    it('does not flip from nonzero to greater nonzero', async () => {
      await tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, false, 3)
      expect(await tickTest.update.staticCall(0, 0, 1, 0, 0, 0, 0, 0, false, 3)).to.eq(false)
    })
    it('flips from nonzero to zero', async () => {
      await tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, false, 3)
      expect(await tickTest.update.staticCall(0, 0, -1, 0, 0, 0, 0, 0, false, 3)).to.eq(true)
    })
    it('does not flip from nonzero to lesser nonzero', async () => {
      await tickTest.update(0, 0, 2, 0, 0, 0, 0, 0, false, 3)
      expect(await tickTest.update.staticCall(0, 0, -1, 0, 0, 0, 0, 0, false, 3)).to.eq(false)
    })
    it('does not flip from nonzero to lesser nonzero', async () => {
      await tickTest.update(0, 0, 2, 0, 0, 0, 0, 0, false, 3)
      expect(await tickTest.update.staticCall(0, 0, -1, 0, 0, 0, 0, 0, false, 3)).to.eq(false)
    })
    it('reverts if total liquidity gross is greater than max', async () => {
      await tickTest.update(0, 0, 2, 0, 0, 0, 0, 0, false, 3)
      await tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, true, 3)
      await expect(tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, false, 3)).to.be.revertedWith('LO')
    })
    it('nets the liquidity based on upper flag', async () => {
      await tickTest.update(0, 0, 2, 0, 0, 0, 0, 0, false, 10)
      await tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, true, 10)
      await tickTest.update(0, 0, 3, 0, 0, 0, 0, 0, true, 10)
      await tickTest.update(0, 0, 1, 0, 0, 0, 0, 0, false, 10)
      const { liquidityGross, liquidityNet } = await tickTest.ticks(0)
      expect(liquidityGross).to.eq(2 + 1 + 3 + 1)
      expect(liquidityNet).to.eq(2 - 1 - 3 + 1)
    })
    it('reverts on overflow liquidity gross', async () => {
      await tickTest.update(0, 0, MaxUint128 / 2n - 1n, 0, 0, 0, 0, 0, false, MaxUint128)
      await expect(tickTest.update(0, 0, MaxUint128 / 2n - 1n, 0, 0, 0, 0, 0, false, MaxUint128)).to.be.reverted
    })
    it('assumes all growth happens below ticks lte current tick', async () => {
      await tickTest.update(1, 1, 1, 1, 2, 3, 4, 5, false, MaxUint128)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        secondsPerLiquidityOutsideX128,
        tickCumulativeOutside,
        initialized,
      } = await tickTest.ticks(1)
      expect(feeGrowthOutside0X128).to.eq(1)
      expect(feeGrowthOutside1X128).to.eq(2)
      expect(secondsPerLiquidityOutsideX128).to.eq(3)
      expect(tickCumulativeOutside).to.eq(4)
      expect(secondsOutside).to.eq(5)
      expect(initialized).to.eq(true)
    })
    it('does not set any growth fields if tick is already initialized', async () => {
      await tickTest.update(1, 1, 1, 1, 2, 3, 4, 5, false, MaxUint128)
      await tickTest.update(1, 1, 1, 6, 7, 8, 9, 10, false, MaxUint128)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        secondsPerLiquidityOutsideX128,
        tickCumulativeOutside,
        initialized,
      } = await tickTest.ticks(1)
      expect(feeGrowthOutside0X128).to.eq(1)
      expect(feeGrowthOutside1X128).to.eq(2)
      expect(secondsPerLiquidityOutsideX128).to.eq(3)
      expect(tickCumulativeOutside).to.eq(4)
      expect(secondsOutside).to.eq(5)
      expect(initialized).to.eq(true)
    })
    it('does not set any growth fields for ticks gt current tick', async () => {
      await tickTest.update(2, 1, 1, 1, 2, 3, 4, 5, false, MaxUint128)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        secondsPerLiquidityOutsideX128,
        tickCumulativeOutside,
        initialized,
      } = await tickTest.ticks(2)
      expect(feeGrowthOutside0X128).to.eq(0)
      expect(feeGrowthOutside1X128).to.eq(0)
      expect(secondsPerLiquidityOutsideX128).to.eq(0)
      expect(tickCumulativeOutside).to.eq(0)
      expect(secondsOutside).to.eq(0)
      expect(initialized).to.eq(true)
    })
  })

  // this is skipped because the presence of the method causes slither to fail
  describe('#clear', async () => {
    it('deletes all the data in the tick', async () => {
      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 1,
        feeGrowthOutside1X128: 2,
        liquidityGross: 3,
        liquidityNet: 4,
        secondsPerLiquidityOutsideX128: 5,
        tickCumulativeOutside: 6,
        secondsOutside: 7,
        initialized: true,
      })
      await tickTest.clear(2)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        secondsPerLiquidityOutsideX128,
        liquidityGross,
        tickCumulativeOutside,
        liquidityNet,
        initialized,
      } = await tickTest.ticks(2)
      expect(feeGrowthOutside0X128).to.eq(0)
      expect(feeGrowthOutside1X128).to.eq(0)
      expect(secondsOutside).to.eq(0)
      expect(secondsPerLiquidityOutsideX128).to.eq(0)
      expect(tickCumulativeOutside).to.eq(0)
      expect(liquidityGross).to.eq(0)
      expect(liquidityNet).to.eq(0)
      expect(initialized).to.eq(false)
    })
  })

  describe('#cross', () => {
    it('flips the growth variables', async () => {
      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 1,
        feeGrowthOutside1X128: 2,
        liquidityGross: 3,
        liquidityNet: 4,
        secondsPerLiquidityOutsideX128: 5,
        tickCumulativeOutside: 6,
        secondsOutside: 7,
        initialized: true,
      })
      await tickTest.cross(2, 7, 9, 8, 15, 10)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        tickCumulativeOutside,
        secondsPerLiquidityOutsideX128,
      } = await tickTest.ticks(2)
      expect(feeGrowthOutside0X128).to.eq(6)
      expect(feeGrowthOutside1X128).to.eq(7)
      expect(secondsPerLiquidityOutsideX128).to.eq(3)
      expect(tickCumulativeOutside).to.eq(9)
      expect(secondsOutside).to.eq(3)
    })
    it('two flips are no op', async () => {
      await tickTest.setTick(2, {
        feeGrowthOutside0X128: 1,
        feeGrowthOutside1X128: 2,
        liquidityGross: 3,
        liquidityNet: 4,
        secondsPerLiquidityOutsideX128: 5,
        tickCumulativeOutside: 6,
        secondsOutside: 7,
        initialized: true,
      })
      await tickTest.cross(2, 7, 9, 8, 15, 10)
      await tickTest.cross(2, 7, 9, 8, 15, 10)
      const {
        feeGrowthOutside0X128,
        feeGrowthOutside1X128,
        secondsOutside,
        tickCumulativeOutside,
        secondsPerLiquidityOutsideX128,
      } = await tickTest.ticks(2)
      expect(feeGrowthOutside0X128).to.eq(1)
      expect(feeGrowthOutside1X128).to.eq(2)
      expect(secondsPerLiquidityOutsideX128).to.eq(5)
      expect(tickCumulativeOutside).to.eq(6)
      expect(secondsOutside).to.eq(7)
    })
  })
})
