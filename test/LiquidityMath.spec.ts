import { expect } from './shared/expect'
import { ethers } from 'hardhat'
import snapshotGasCost from './shared/snapshotGasCost'

describe('LiquidityMath', () => {
  let liquidityMath: any

  before('deploy LiquidityMathTest', async () => {
    const factory = await ethers.getContractFactory('LiquidityMathTest')
    liquidityMath = await factory.deploy()
  })

  describe('#addDelta', () => {
    it('returns correct value for 1 + 0', async () => {
      expect(await liquidityMath.addDelta(1n, 0n)).to.eq(1n)
    })
    it('returns correct value for 1 + -1', async () => {
      expect(await liquidityMath.addDelta(1n, -1n)).to.eq(0n)
    })
    it('returns correct value for 1 + 1', async () => {
      expect(await liquidityMath.addDelta(1n, 1n)).to.eq(2n)
    })
    it('reverts on overflow when adding to large number', async () => {
      await expect(liquidityMath.addDelta(2n ** 128n - 15n, 15n)).to.be.revertedWith('LA')
    })
    it('reverts on underflow when subtracting from zero', async () => {
      await expect(liquidityMath.addDelta(0n, -1n)).to.be.revertedWith('LS')
    })
    it('reverts on underflow when subtracting more than available', async () => {
      await expect(liquidityMath.addDelta(3n, -4n)).to.be.revertedWith('LS')
    })
    it('gas cost of addition', async () => {
      await snapshotGasCost(liquidityMath.getGasCostOfAddDelta(15n, 4n))
    })
    it('gas cost of subtraction', async () => {
      await snapshotGasCost(liquidityMath.getGasCostOfAddDelta(15n, -4n))
    })
  })
})
