import { ethers } from 'hardhat'
import { MockTimeUniswapV3Pool } from '../../typechain-types/test/MockTimeUniswapV3Pool'
import { TestERC20 } from '../../typechain-types/test/TestERC20'
import { UniswapV3Factory } from '../../typechain-types/UniswapV3Factory'
import { TestUniswapV3Callee } from '../../typechain-types/test/TestUniswapV3Callee'
import { TestUniswapV3Router } from '../../typechain-types/test/TestUniswapV3Router'
import { MockTimeUniswapV3PoolDeployer } from '../../typechain-types/test/MockTimeUniswapV3PoolDeployer'

interface FactoryFixture {
  factory: UniswapV3Factory
}

async function factoryFixture(): Promise<FactoryFixture> {
  const factoryFactory = await ethers.getContractFactory('UniswapV3Factory')
  const factory = (await factoryFactory.deploy()) as UniswapV3Factory
  return { factory }
}

interface TokensFixture {
  token0: TestERC20
  token1: TestERC20
  token2: TestERC20
}

async function tokensFixture(): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('TestERC20')
  const tokenA = (await tokenFactory.deploy(2n ** 255n)) as TestERC20
  const tokenB = (await tokenFactory.deploy(2n ** 255n)) as TestERC20
  const tokenC = (await tokenFactory.deploy(2n ** 255n)) as TestERC20

  const tokens = [tokenA, tokenB, tokenC]
  const addresses = await Promise.all(tokens.map(token => token.getAddress()))
  const [token0, token1, token2] = tokens.map((token, i) => ({ token, address: addresses[i] }))
    .sort((a, b) => a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1)
    .map(({ token }) => token)

  return { token0, token1, token2 }
}

type TokensAndFactoryFixture = FactoryFixture & TokensFixture

interface PoolFixture extends TokensAndFactoryFixture {
  swapTargetCallee: TestUniswapV3Callee
  swapTargetRouter: TestUniswapV3Router
  createPool(
    fee: number,
    tickSpacing: number,
    firstToken?: TestERC20,
    secondToken?: TestERC20
  ): Promise<MockTimeUniswapV3Pool>
}

// Monday, October 5, 2020 9:00:00 AM GMT-05:00
export const TEST_POOL_START_TIME = 1601906400

export const poolFixture = async function (): Promise<PoolFixture> {
  const { factory } = await factoryFixture()
  const { token0, token1, token2 } = await tokensFixture()

  const MockTimeUniswapV3PoolDeployerFactory = await ethers.getContractFactory('MockTimeUniswapV3PoolDeployer')
  const MockTimeUniswapV3PoolFactory = await ethers.getContractFactory('MockTimeUniswapV3Pool')

  const calleeContractFactory = await ethers.getContractFactory('TestUniswapV3Callee')
  const routerContractFactory = await ethers.getContractFactory('TestUniswapV3Router')

  const swapTargetCallee = (await calleeContractFactory.deploy()) as TestUniswapV3Callee
  const swapTargetRouter = (await routerContractFactory.deploy()) as TestUniswapV3Router

  return {
    token0,
    token1,
    token2,
    factory,
    swapTargetCallee,
    swapTargetRouter,
    createPool: async (fee, tickSpacing, firstToken = token0, secondToken = token1) => {
      // const MockTimeUniswapV3Pool = await ethers.getContractFactory('MockTimeUniswapV3Pool')
      // const mockTimePool = await MockTimeUniswapV3Pool.deploy()
      // await mockTimePool.waitForDeployment()
      
      const mockTimePoolDeployer = (await MockTimeUniswapV3PoolDeployerFactory.deploy()) as MockTimeUniswapV3PoolDeployer
      const tx = await mockTimePoolDeployer.deploy(
        await factory.getAddress(),
        await firstToken.getAddress(),
        await secondToken.getAddress(),
        fee,
        tickSpacing
      )

      const receipt = await tx.wait()
      if (!receipt) throw new Error('Transaction failed')
      const log = receipt.logs[0]
      const poolAddress = mockTimePoolDeployer.interface.parseLog({ 
        topics: log.topics, 
        data: log.data 
      })?.args.pool as string
      return MockTimeUniswapV3PoolFactory.attach(poolAddress) as MockTimeUniswapV3Pool
    },
  }
}
