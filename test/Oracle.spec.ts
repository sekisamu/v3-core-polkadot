import { ethers } from 'hardhat'
import { expect } from './shared/expect'
import { expect as chaiExpect } from 'chai'
import checkObservationEquals from './shared/checkObservationEquals'
import snapshotGasCost from './shared/snapshotGasCost'
import { MaxUint128 } from './shared/utilities'
import { TEST_POOL_START_TIME } from './shared/fixtures'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { OracleTest } from '../typechain-types/test/OracleTest'

describe('Oracle', () => {
  let signer: any
  let otherSigner: any
  let oracle: any

  async function deployOracle() {
    const oracleTestFactory = await ethers.getContractFactory('OracleTest')
    return await oracleTestFactory.deploy()
  }

  async function deployAndInitializeOracle() {
    const oracle = await deployOracle()
    await oracle.initialize({
      time: 0n,
      tick: 0n,
      liquidity: 0n,
    })
    return oracle
  }

  before('setup signers', async () => {
    [signer, otherSigner] = await ethers.getSigners()
  })

  describe('initialization', () => {
    beforeEach('deploy test oracle', async () => {
      oracle = await deployOracle()
    })

    it('should set initial index to 0', async () => {
      await oracle.initialize({ liquidity: 1n, tick: 1n, time: 1n })
      expect(await oracle.index()).to.eq(0n)
    })

    it('should set initial cardinality to 1', async () => {
      await oracle.initialize({ liquidity: 1n, tick: 1n, time: 1n })
      expect(await oracle.cardinality()).to.eq(1n)
    })

    it('should set initial cardinality next to 1', async () => {
      await oracle.initialize({ liquidity: 1n, tick: 1n, time: 1n })
      expect(await oracle.cardinalityNext()).to.eq(1n)
    })

    it('should initialize only the first slot timestamp', async () => {
      await oracle.initialize({ liquidity: 1n, tick: 1n, time: 1n })
      checkObservationEquals(await oracle.observations(0), {
        initialized: true,
        blockTimestamp: 1n,
        tickCumulative: 0n,
        secondsPerLiquidityCumulativeX128: 0n,
      })
    })

    it('should measure gas cost of initialization', async () => {
      await snapshotGasCost(oracle.initialize({ liquidity: 1n, tick: 1n, time: 1n }))
    })
  })

  describe('growing observation array', () => {
    beforeEach('deploy initialized test oracle', async () => {
      oracle = await deployAndInitializeOracle()
    })

    it('should increase cardinality next on first call', async () => {
      await oracle.grow(5)
      expect(await oracle.index()).to.eq(0n)
      expect(await oracle.cardinality()).to.eq(1n)
      expect(await oracle.cardinalityNext()).to.eq(5n)
    })

    it('should preserve first slot data when growing', async () => {
      await oracle.grow(5)
      checkObservationEquals(await oracle.observations(0), {
        secondsPerLiquidityCumulativeX128: 0n,
        tickCumulative: 0n,
        blockTimestamp: 0n,
        initialized: true,
      })
    })

    it('should not modify size if already greater than or equal to target', async () => {
      await oracle.grow(5)
      await oracle.grow(3)
      expect(await oracle.index()).to.eq(0n)
      expect(await oracle.cardinality()).to.eq(1n)
      expect(await oracle.cardinalityNext()).to.eq(5n)
    })

    it('should initialize new slots with zero values', async () => {
      await oracle.grow(5)
      for (let i = 1; i < 5; i++) {
        checkObservationEquals(await oracle.observations(i), {
          secondsPerLiquidityCumulativeX128: 0n,
          tickCumulative: 0n,
          blockTimestamp: 1n,
          initialized: false,
        })
      }
    })

    it('should handle growing after index wrap', async () => {
      await oracle.grow(2)
      await oracle.update({ advanceTimeBy: 2n, liquidity: 1n, tick: 1n })
      await oracle.update({ advanceTimeBy: 2n, liquidity: 1n, tick: 1n })
      expect(await oracle.index()).to.eq(0n)
      await oracle.grow(3)
      expect(await oracle.index()).to.eq(0n)
      expect(await oracle.cardinality()).to.eq(2n)
      expect(await oracle.cardinalityNext()).to.eq(3n)
    })

    it('should measure gas costs for growing operations', async () => {
      // Growing by 1 slot at cardinality boundary
      await snapshotGasCost(oracle.grow(2))
      
      // Growing by 10 slots at cardinality boundary
      await snapshotGasCost(oracle.grow(11))
      
      // Growing by 1 slot within cardinality
      await oracle.grow(2)
      await snapshotGasCost(oracle.grow(3))
      
      // Growing by 10 slots within cardinality
      await oracle.grow(2)
      await snapshotGasCost(oracle.grow(12))
    })
  })

  describe('writing observations', () => {
    beforeEach('deploy initialized test oracle', async () => {
      oracle = await deployAndInitializeOracle()
    })

    it('should overwrite single element array correctly', async () => {
      await oracle.update({ advanceTimeBy: 1n, tick: 2n, liquidity: 5n })
      expect(await oracle.index()).to.eq(0n)
      checkObservationEquals(await oracle.observations(0), {
        initialized: true,
        secondsPerLiquidityCumulativeX128: 340282366920938463463374607431768211456n,
        tickCumulative: 0n,
        blockTimestamp: 1n,
      })
      await oracle.update({ advanceTimeBy: 5n, tick: -1n, liquidity: 8n })
      expect(await oracle.index()).to.eq(0n)
      checkObservationEquals(await oracle.observations(0), {
        initialized: true,
        secondsPerLiquidityCumulativeX128: 680564733841876926926749214863536422912n,
        tickCumulative: 10n,
        blockTimestamp: 6n,
      })
      await oracle.update({ advanceTimeBy: 3n, tick: 2n, liquidity: 3n })
      expect(await oracle.index()).to.eq(0n)
      checkObservationEquals(await oracle.observations(0), {
        initialized: true,
        secondsPerLiquidityCumulativeX128: 808170621437228850725514692650449502208n,
        tickCumulative: 7n,
        blockTimestamp: 9n,
      })
    })

    it('should not update if time has not changed', async () => {
      await oracle.grow(2)
      await oracle.update({ advanceTimeBy: 1n, tick: 3n, liquidity: 2n })
      expect(await oracle.index()).to.eq(1n)
      await oracle.update({ advanceTimeBy: 0n, tick: -5n, liquidity: 9n })
      expect(await oracle.index()).to.eq(1n)
    })

    it('should write new index when time changes', async () => {
      await oracle.grow(3)
      await oracle.update({ advanceTimeBy: 6n, tick: 3n, liquidity: 2n })
      expect(await oracle.index()).to.eq(1n)
      await oracle.update({ advanceTimeBy: 4n, tick: -5n, liquidity: 9n })

      expect(await oracle.index()).to.eq(2n)
      checkObservationEquals(await oracle.observations(1), {
        tickCumulative: 0n,
        secondsPerLiquidityCumulativeX128: 2041694201525630780780247644590609268736n,
        initialized: true,
        blockTimestamp: 6n,
      })
    })

    it('should grow cardinality when writing past current size', async () => {
      await oracle.grow(2)
      await oracle.grow(4)
      expect(await oracle.cardinality()).to.eq(1n)
      await oracle.update({ advanceTimeBy: 3n, tick: 5n, liquidity: 6n })
      expect(await oracle.cardinality()).to.eq(4n)
      await oracle.update({ advanceTimeBy: 4n, tick: 6n, liquidity: 4n })
      expect(await oracle.cardinality()).to.eq(4n)
      expect(await oracle.index()).to.eq(2n)
      checkObservationEquals(await oracle.observations(2), {
        secondsPerLiquidityCumulativeX128: 1247702012043441032699040227249816775338n,
        tickCumulative: 20n,
        initialized: true,
        blockTimestamp: 7n,
      })
    })

    it('wraps around', async () => {
      await oracle.grow(3)
      await oracle.update({ advanceTimeBy: 3n, tick: 1n, liquidity: 2n })
      await oracle.update({ advanceTimeBy: 4n, tick: 2n, liquidity: 3n })
      await oracle.update({ advanceTimeBy: 5n, tick: 3n, liquidity: 4n })

      expect(await oracle.index()).to.eq(0n)

      checkObservationEquals(await oracle.observations(0), {
        secondsPerLiquidityCumulativeX128: 2268549112806256423089164049545121409706n,
        tickCumulative: 14n,
        initialized: true,
        blockTimestamp: 12n,
      })
    })

    it('accumulates liquidity', async () => {
      await oracle.grow(4)

      await oracle.update({ advanceTimeBy: 3n, tick: 3n, liquidity: 2n })
      await oracle.update({ advanceTimeBy: 4n, tick: -7n, liquidity: 6n })
      await oracle.update({ advanceTimeBy: 5n, tick: -2n, liquidity: 4n })

      expect(await oracle.index()).to.eq(3n)

      checkObservationEquals(await oracle.observations(1), {
        initialized: true,
        tickCumulative: 0n,
        secondsPerLiquidityCumulativeX128: 1020847100762815390390123822295304634368n,
        blockTimestamp: 3n,
      })
      checkObservationEquals(await oracle.observations(2), {
        initialized: true,
        tickCumulative: 12n,
        secondsPerLiquidityCumulativeX128: 1701411834604692317316873037158841057280n,
        blockTimestamp: 7n,
      })
      checkObservationEquals(await oracle.observations(3), {
        initialized: true,
        tickCumulative: -23n,
        secondsPerLiquidityCumulativeX128: 1984980473705474370203018543351981233493n,
        blockTimestamp: 12n,
      })
      checkObservationEquals(await oracle.observations(4), {
        initialized: false,
        tickCumulative: 0n,
        secondsPerLiquidityCumulativeX128: 0n,
        blockTimestamp: 0n,
      })
    })
  })

  describe('observing oracle state', () => {
    describe('before initialization', async () => {
      beforeEach('deploy test oracle', async () => {
        oracle = await deployOracle()
      })

      const observeSingle = async (secondsAgo: bigint) => {
        const {
          tickCumulatives: [tickCumulative],
          secondsPerLiquidityCumulativeX128s: [secondsPerLiquidityCumulativeX128],
        } = await oracle.observe([secondsAgo])
        return { secondsPerLiquidityCumulativeX128, tickCumulative }
      }

      it('should fail before initialization', async () => {
        await expect(observeSingle(0n)).to.be.revertedWith('I')
      })

      it('should fail if older observation does not exist', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        await expect(observeSingle(1n)).to.be.revertedWith('OLD')
      })

      it('should handle overflow boundary correctly', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: BigInt(2 ** 32 - 1) })
        await oracle.advanceTime(2n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(1n)
        expect(tickCumulative).to.be.eq(2n)
        expect(secondsPerLiquidityCumulativeX128).to.be.eq(85070591730234615865843651857942052864n)
      })

      it('interpolates correctly at max liquidity', async () => {
        await oracle.initialize({ liquidity: MaxUint128, tick: 0n, time: 0n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 13n, tick: 0n, liquidity: 0n })
        let { secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(13n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(6n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(7n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(12n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(1n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(13n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('interpolates correctly at min liquidity', async () => {
        await oracle.initialize({ liquidity: 0n, tick: 0n, time: 0n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 13n, tick: 0n, liquidity: MaxUint128 })
        let { secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(13n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(6n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(7n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(12n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(1n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(13n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('interpolates the same as 0 liquidity for 1 liquidity', async () => {
        await oracle.initialize({ liquidity: 1n, tick: 0n, time: 0n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 13n, tick: 0n, liquidity: MaxUint128 })
        let { secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(13n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(6n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(7n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(12n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(1n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(13n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('interpolates correctly across uint32 seconds boundaries', async () => {
        // setup
        await oracle.initialize({ liquidity: 0n, tick: 0n, time: 0n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: BigInt(2 ** 32 - 6), tick: 0n, liquidity: 0n })
        let { secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(BigInt(2 ** 32 - 6) << 128n)
        await oracle.update({ advanceTimeBy: 13n, tick: 0n, liquidity: 0n })
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(0n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(7n << 128n)

        // interpolation checks
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(3n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(4n << 128n)
        ;({ secondsPerLiquidityCumulativeX128 } = await observeSingle(8n))
        expect(secondsPerLiquidityCumulativeX128).to.eq(BigInt(2 ** 32 - 1) << 128n)
      })

      it('single observation at current time', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(tickCumulative).to.eq(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('single observation in past but not earlier than secondsAgo', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        await oracle.advanceTime(3n)
        await expect(observeSingle(4n)).to.be.revertedWith('OLD')
      })

      it('single observation in past at exactly seconds ago', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        await oracle.advanceTime(3n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(3n)
        expect(tickCumulative).to.eq(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('single observation in past counterfactual in past', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        await oracle.advanceTime(3n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(1n)
        expect(tickCumulative).to.eq(4n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(170141183460469231731687303715884105728n)
      })

      it('single observation in past counterfactual now', async () => {
        await oracle.initialize({ liquidity: 4n, tick: 2n, time: 5n })
        await oracle.advanceTime(3n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(tickCumulative).to.eq(6n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(255211775190703847597530955573826158592n)
      })

      it('two observations in chronological order 0 seconds ago exact', async () => {
        await oracle.initialize({ liquidity: 5n, tick: -5n, time: 5n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(tickCumulative).to.eq(-20n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(272225893536750770770699685945414569164n)
      })

      it('two observations in chronological order 0 seconds ago counterfactual', async () => {
        await oracle.initialize({ liquidity: 5n, tick: -5n, time: 5n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        await oracle.advanceTime(7n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(tickCumulative).to.eq(-13n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(1463214177760035392892510811956603309260n)
      })

      it('two observations in chronological order seconds ago is exactly on first observation', async () => {
        await oracle.initialize({ liquidity: 5n, tick: -5n, time: 5n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        await oracle.advanceTime(7n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(11n)
        expect(tickCumulative).to.eq(0n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(0n)
      })

      it('two observations in chronological order seconds ago is between first and second', async () => {
        await oracle.initialize({ liquidity: 5n, tick: -5n, time: 5n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        await oracle.advanceTime(7n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(9n)
        expect(tickCumulative).to.eq(-10n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(136112946768375385385349842972707284582n)
      })

      it('two observations in reverse order 0 seconds ago exact', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await oracle.grow(2)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        await oracle.update({ advanceTimeBy: 3n, tick: -5n, liquidity: 4n })
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
        expect(tickCumulative).to.eq(-17n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(782649443918158465965761597093066886348n)
      })

      it('two observations in reverse order 0 seconds ago counterfactual', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await oracle.grow(2)
        await oracle.update({ advanceTimeBy: 4, tick: 1, liquidity: 2 })
        await oracle.update({ advanceTimeBy: 3, tick: -5, liquidity: 4 })
        await oracle.advanceTime(7)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0)
        expect(tickCumulative).to.eq(-52)
        expect(secondsPerLiquidityCumulativeX128).to.eq('1378143586029800777026667160098661256396')
      })

      it('two observations in reverse order seconds ago is exactly on first observation', async () => {
        await oracle.initialize({ liquidity: 5n, tick: -5n, time: 5n })
        await oracle.grow(2n)
        await oracle.update({ advanceTimeBy: 4n, tick: 1n, liquidity: 2n })
        await oracle.update({ advanceTimeBy: 3n, tick: -5n, liquidity: 4n })
        await oracle.advanceTime(7n)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(10n)
        expect(tickCumulative).to.eq(-20n)
        expect(secondsPerLiquidityCumulativeX128).to.eq(272225893536750770770699685945414569164n)
      })

      it('two observations in reverse order seconds ago is between first and second', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await oracle.grow(2)
        await oracle.update({ advanceTimeBy: 4, tick: 1, liquidity: 2 })
        await oracle.update({ advanceTimeBy: 3, tick: -5, liquidity: 4 })
        await oracle.advanceTime(7)
        const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(9)
        expect(tickCumulative).to.eq(-19)
        expect(secondsPerLiquidityCumulativeX128).to.eq('442367076997220002502386989661298674892')
      })

      it('can fetch multiple observations', async () => {
        await oracle.initialize({ time: 5n, tick: 2n, liquidity: 2n ** 15n })
        await oracle.grow(4n)
        await oracle.update({ advanceTimeBy: 13n, tick: 6n, liquidity: 2n ** 12n })
        await oracle.advanceTime(5n)

        const { tickCumulatives, secondsPerLiquidityCumulativeX128s } = await oracle.observe([0n, 3n, 8n, 13n, 15n, 18n])
        expect(tickCumulatives).to.have.lengthOf(6)
        expect(tickCumulatives[0]).to.eq(56n)
        expect(tickCumulatives[1]).to.eq(38n)
        expect(tickCumulatives[2]).to.eq(20n)
        expect(tickCumulatives[3]).to.eq(10n)
        expect(tickCumulatives[4]).to.eq(6n)
        expect(tickCumulatives[5]).to.eq(0n)
        expect(secondsPerLiquidityCumulativeX128s).to.have.lengthOf(6)
        expect(secondsPerLiquidityCumulativeX128s[0]).to.eq(550383467004691728624232610897330176n)
        expect(secondsPerLiquidityCumulativeX128s[1]).to.eq(301153217795020002454768787094765568n)
        expect(secondsPerLiquidityCumulativeX128s[2]).to.eq(103845937170696552570609926584401920n)
        expect(secondsPerLiquidityCumulativeX128s[3]).to.eq(51922968585348276285304963292200960n)
        expect(secondsPerLiquidityCumulativeX128s[4]).to.eq(31153781151208965771182977975320576n)
        expect(secondsPerLiquidityCumulativeX128s[5]).to.eq(0n)
      })

      it('gas for observe since most recent', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await oracle.advanceTime(2)
        await snapshotGasCost(oracle.getGasCostOfObserve([1]))
      })

      it('gas for single observation at current time', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await snapshotGasCost(oracle.getGasCostOfObserve([0]))
      })

      it('gas for single observation at current time counterfactually computed', async () => {
        await oracle.initialize({ liquidity: 5, tick: -5, time: 5 })
        await oracle.advanceTime(5)
        await snapshotGasCost(oracle.getGasCostOfObserve([0]))
      })
    })

    for (const startingTime of [5n, 2n ** 32n - 5n]) {
      describe(`initialized with 5 observations with starting time of ${startingTime}`, () => {
                  const oracleFixture5Observations = async () => {
            const oracle = await deployOracle()
            await oracle.initialize({ liquidity: 5n, tick: -5n, time: BigInt(startingTime) })
            await oracle.grow(5n)
            await oracle.update({ advanceTimeBy: 3n, tick: 1n, liquidity: 2n })
            await oracle.update({ advanceTimeBy: 2n, tick: -6n, liquidity: 4n })
            await oracle.update({ advanceTimeBy: 4n, tick: -2n, liquidity: 4n })
            await oracle.update({ advanceTimeBy: 1n, tick: -2n, liquidity: 9n })
            await oracle.update({ advanceTimeBy: 3n, tick: 4n, liquidity: 2n })
            await oracle.update({ advanceTimeBy: 6n, tick: 6n, liquidity: 7n })
            return oracle
          }
          let oracle: OracleTest
          beforeEach('set up observations', async () => {
            oracle = await loadFixture(oracleFixture5Observations)
          })

        const observeSingle = async (secondsAgo: bigint) => {
          const {
            tickCumulatives: [tickCumulative],
            secondsPerLiquidityCumulativeX128s: [secondsPerLiquidityCumulativeX128],
          } = await oracle.observe([secondsAgo])
          return { secondsPerLiquidityCumulativeX128, tickCumulative }
        }

        it('index, cardinality, cardinality next', async () => {
          expect(await oracle.index()).to.eq(1n)
          expect(await oracle.cardinality()).to.eq(5n)
          expect(await oracle.cardinalityNext()).to.eq(5n)
        })
        it('latest observation same time as latest', async () => {
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
          expect(tickCumulative).to.eq(-21n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(2104079302127802832415199655953100107502n)
        })
        it('latest observation 5 seconds after latest', async () => {
          await oracle.advanceTime(5n)
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(5n)
          expect(tickCumulative).to.eq(-21n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(2104079302127802832415199655953100107502n)
        })
        it('current observation 5 seconds after latest', async () => {
          await oracle.advanceTime(5n)
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(0n)
          expect(tickCumulative).to.eq(9n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(2347138135642758877746181518404363115684n)
        })
        it('between latest observation and just before latest observation at same time as latest', async () => {
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(3n)
          expect(tickCumulative).to.eq(-33n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(1593655751746395137220137744805447790318n)
        })
        it('between latest observation and just before latest observation after the latest observation', async () => {
          await oracle.advanceTime(5n)
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(8n)
          expect(tickCumulative).to.eq(-33n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(1593655751746395137220137744805447790318n)
        })
        it('older than oldest reverts', async () => {
          await expect(observeSingle(15n)).to.be.revertedWith('OLD')
          await oracle.advanceTime(5n)
          await expect(observeSingle(20n)).to.be.revertedWith('OLD')
        })
        it('oldest observation', async () => {
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(14n)
          expect(tickCumulative).to.eq(-13n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(544451787073501541541399371890829138329n)
        })
        it('oldest observation after some time', async () => {
          await oracle.advanceTime(6n)
          const { tickCumulative, secondsPerLiquidityCumulativeX128 } = await observeSingle(20n)
          expect(tickCumulative).to.eq(-13n)
          expect(secondsPerLiquidityCumulativeX128).to.eq(544451787073501541541399371890829138329n)
        })

        it('fetch many values', async () => {
          await oracle.advanceTime(6)
          const { tickCumulatives, secondsPerLiquidityCumulativeX128s } = await oracle.observe([
            20n,
            17n,
            13n,
            10n,
            5n,
            1n,
            0n,
          ])
          expect({
            tickCumulatives: tickCumulatives.map((tc: bigint) => tc),
            secondsPerLiquidityCumulativeX128s: secondsPerLiquidityCumulativeX128s.map((lc: bigint) => lc),
          }).to.deep.equal({
            tickCumulatives: [-13n, -17n, -25n, -31n, -39n, -47n, -52n],
            secondsPerLiquidityCumulativeX128s: [
              544451787073501541541399371890829138329n,
              782649443918158465965761597093066886348n,
              1190996837791659407507123822295304634368n,
              1428925831284197757965761597093066886348n,
              1837273225157698699507123822295304634368n,
              2075202218650237049965761597093066886348n,
              2347138135642758877746181518404363115684n
            ]
          })
        })

        it('gas all of last 20 seconds', async () => {
          await oracle.advanceTime(6)
          await snapshotGasCost(
            oracle.getGasCostOfObserve([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
          )
        })

        it('gas latest equal', async () => {
          await snapshotGasCost(oracle.getGasCostOfObserve([0]))
        })
        it('gas latest transform', async () => {
          await oracle.advanceTime(5)
          await snapshotGasCost(oracle.getGasCostOfObserve([0]))
        })
        it('gas oldest', async () => {
          await snapshotGasCost(oracle.getGasCostOfObserve([14]))
        })
        it('gas between oldest and oldest + 1', async () => {
          await snapshotGasCost(oracle.getGasCostOfObserve([13]))
        })
        it('gas middle', async () => {
          await snapshotGasCost(oracle.getGasCostOfObserve([5]))
        })
      })
    }
  })

  describe.skip('full oracle', function () {
    this.timeout(1_200_000)

    let oracle: OracleTest

    const BATCH_SIZE = 300n

    const STARTING_TIME = TEST_POOL_START_TIME

    const maxedOutOracleFixture = async () => {
      const oracle = await deployOracle()
      await oracle.initialize({ liquidity: 0n, tick: 0n, time: STARTING_TIME })
      let cardinalityNext = await oracle.cardinalityNext()
      while (cardinalityNext < 65535n) {
        const growTo = cardinalityNext + BATCH_SIZE > 65535n ? 65535n : cardinalityNext + BATCH_SIZE
        console.log('growing from', cardinalityNext.toString(), 'to', growTo.toString())
        await oracle.grow(growTo)
        cardinalityNext = growTo
      }

      for (let i = 0n; i < 65535n; i += BATCH_SIZE) {
        console.log('batch update starting at', i.toString())
        const batch = Array(Number(BATCH_SIZE))
          .fill(null)
          .map((_, j) => ({
            advanceTimeBy: 13n,
            tick: -(i + BigInt(j)),
            liquidity: i + BigInt(j),
          }))
        await oracle.batchUpdate(batch)
      }

      return oracle
    }

    beforeEach('create a full oracle', async () => {
      oracle = await loadFixture(maxedOutOracleFixture)
    })

    it('has max cardinality next', async () => {
      expect(await oracle.cardinalityNext()).to.eq(65535)
    })

    it('has max cardinality', async () => {
      expect(await oracle.cardinality()).to.eq(65535)
    })

    it('index wrapped around', async () => {
      expect(await oracle.index()).to.eq(165)
    })

    async function checkObserve(
      secondsAgo: bigint,
      expected?: { tickCumulative: bigint; secondsPerLiquidityCumulativeX128: bigint }
    ) {
      const { tickCumulatives, secondsPerLiquidityCumulativeX128s } = await oracle.observe([secondsAgo])
      const check = {
        tickCumulative: tickCumulatives[0].toString(),
        secondsPerLiquidityCumulativeX128: secondsPerLiquidityCumulativeX128s[0].toString(),
      }
      if (typeof expected === 'undefined') {
        expect(check).to.deep.equal({
          tickCumulative: check.tickCumulative,
          secondsPerLiquidityCumulativeX128: check.secondsPerLiquidityCumulativeX128,
        })
      } else {
        expect(check).to.deep.eq({
          tickCumulative: expected.tickCumulative.toString(),
          secondsPerLiquidityCumulativeX128: expected.secondsPerLiquidityCumulativeX128.toString(),
        })
      }
    }

    it('can observe into the ordered portion with exact seconds ago', async () => {
      await checkObserve(100n * 13n, {
        secondsPerLiquidityCumulativeX128: 60465049086512033878831623038233202591033n,
        tickCumulative: -27970560813n,
      })
    })

    it('can observe into the ordered portion with unexact seconds ago', async () => {
      await checkObserve(100n * 13n + 5n, {
        secondsPerLiquidityCumulativeX128: 60465023149565257990964350912969670793706n,
        tickCumulative: -27970232823n,
      })
    })

    it('can observe at exactly the latest observation', async () => {
      await checkObserve(0, {
        secondsPerLiquidityCumulativeX128: '60471787506468701386237800669810720099776',
        tickCumulative: '-28055903863',
      })
    })

    it('can observe at exactly the latest observation after some time passes', async () => {
      await oracle.advanceTime(5)
      await checkObserve(5, {
        secondsPerLiquidityCumulativeX128: '60471787506468701386237800669810720099776',
        tickCumulative: '-28055903863',
      })
    })

    it('can observe after the latest observation counterfactual', async () => {
      await oracle.advanceTime(5)
      await checkObserve(3, {
        secondsPerLiquidityCumulativeX128: '60471797865298117996489508104462919730461',
        tickCumulative: '-28056035261',
      })
    })

    it('can observe into the unordered portion of array at exact seconds ago of observation', async () => {
      await checkObserve(200 * 13, {
        secondsPerLiquidityCumulativeX128: '60458300386499273141628780395875293027404',
        tickCumulative: '-27885347763',
      })
    })

    it('can observe into the unordered portion of array at seconds ago between observations', async () => {
      await checkObserve(200 * 13 + 5, {
        secondsPerLiquidityCumulativeX128: '60458274409952896081377821330361274907140',
        tickCumulative: '-27885020273',
      })
    })

    it('can observe the oldest observation 13*65534 seconds ago', async () => {
      await checkObserve(13n * 65534n, {
        secondsPerLiquidityCumulativeX128: 33974356747348039873972993881117400879779n,
        tickCumulative: -175890n,
      })
    })

    it('can observe the oldest observation 13*65534 + 5 seconds ago if time has elapsed', async () => {
      await oracle.advanceTime(5n)
      await checkObserve(13n * 65534n + 5n, {
        secondsPerLiquidityCumulativeX128: 33974356747348039873972993881117400879779n,
        tickCumulative: -175890n,
      })
    })

    it('gas cost of observe(0)', async () => {
      await snapshotGasCost(oracle.getGasCostOfObserve([0n]))
    })
    it('gas cost of observe(200 * 13)', async () => {
      await snapshotGasCost(oracle.getGasCostOfObserve([200n * 13n]))
    })
    it('gas cost of observe(200 * 13 + 5)', async () => {
      await snapshotGasCost(oracle.getGasCostOfObserve([200n * 13n + 5n]))
    })
    it('gas cost of observe(0) after 5 seconds', async () => {
      await oracle.advanceTime(5n)
      await snapshotGasCost(oracle.getGasCostOfObserve([0n]))
    })
    it('gas cost of observe(5) after 5 seconds', async () => {
      await oracle.advanceTime(5n)
      await snapshotGasCost(oracle.getGasCostOfObserve([5n]))
    })
    it('gas cost of observe(oldest)', async () => {
      await snapshotGasCost(oracle.getGasCostOfObserve([65534n * 13n]))
    })
    it('gas cost of observe(oldest) after 5 seconds', async () => {
      await oracle.advanceTime(5n)
      await snapshotGasCost(oracle.getGasCostOfObserve([65534n * 13n + 5n]))
    })
  })
})
