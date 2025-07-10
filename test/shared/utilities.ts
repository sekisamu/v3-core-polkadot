import { ethers, Wallet, Contract, ContractTransactionResponse, MaxUint256, BaseContract, AddressLike } from 'ethers'
import * as hre from 'hardhat'
import type { TypedContractMethod } from '../../typechain-types/common'
import bn from 'bignumber.js'
type BigNumberish = string | bigint | number
type ContractTransaction = ContractTransactionResponse
import { TestUniswapV3Callee } from '../../typechain-types/test/TestUniswapV3Callee'
import { TestUniswapV3Router } from '../../typechain-types/test/TestUniswapV3Router'
import { MockTimeUniswapV3Pool } from '../../typechain-types/test/MockTimeUniswapV3Pool'
import { TestERC20 } from '../../typechain-types/test/TestERC20'

export const MaxUint128 = 2n ** 128n - 1n

export const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing
export const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing
export const getMaxLiquidityPerTick = (tickSpacing: number) =>
  (2n ** 128n - 1n) / BigInt((getMaxTick(tickSpacing) - getMinTick(tickSpacing)) / tickSpacing + 1)

export const MIN_SQRT_RATIO = 4295128739n
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

export enum FeeAmount {
  LOW = 500,
  MEDIUM = 3000,
  HIGH = 10000,
  CUSTOM = 250
}

export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
  [FeeAmount.LOW]: 10,
  [FeeAmount.MEDIUM]: 60,
  [FeeAmount.HIGH]: 200,
  [FeeAmount.CUSTOM]: 15
}

export function expandTo18Decimals(n: bigint): bigint {
  return n * (10n ** 18n)
}

export function getCreate2Address(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  fee: number,
  bytecode: string
): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
  const constructorArgumentsEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint24'],
    [token0, token1, fee]
  )
  const create2Inputs = [
    '0xff',
    factoryAddress,
    ethers.keccak256(constructorArgumentsEncoded),
    ethers.keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return ethers.getAddress(`0x${ethers.keccak256(sanitizedInputs).slice(-40)}`)
}

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

// returns the sqrt price as a 64x96
export function encodePriceSqrt(reserve1: bigint, reserve0: bigint): bigint {
  return BigInt(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

export function getPositionKey(address: string, lowerTick: number, upperTick: number): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'int24', 'int24'],
      [address, lowerTick, upperTick]
    )
  )
}

export type SwapFunction = (
  amount: BigNumberish,
  to: Wallet | string,
  sqrtPriceLimitX96?: BigNumberish
) => Promise<ContractTransaction>
export type SwapToPriceFunction = (sqrtPriceX96: BigNumberish, to: Wallet | string) => Promise<ContractTransaction>
export type FlashFunction = (
  amount0: BigNumberish,
  amount1: BigNumberish,
  to: Wallet | string,
  pay0?: BigNumberish,
  pay1?: BigNumberish
) => Promise<ContractTransaction>
export type MintFunction = (
  recipient: string,
  tickLower: BigNumberish,
  tickUpper: BigNumberish,
  liquidity: BigNumberish
) => Promise<ContractTransaction>
export interface PoolFunctions {
  swapToLowerPrice: SwapToPriceFunction
  swapToHigherPrice: SwapToPriceFunction
  swapExact0For1: SwapFunction
  swap0ForExact1: SwapFunction
  swapExact1For0: SwapFunction
  swap1ForExact0: SwapFunction
  flash: FlashFunction
  mint: MintFunction
}
export function createPoolFunctions({
  swapTarget,
  token0,
  token1,
  pool,
}: {
  swapTarget: TestUniswapV3Callee
  token0: TestERC20
  token1: TestERC20
  pool: MockTimeUniswapV3Pool
}): PoolFunctions {
  async function swapToSqrtPrice(
    inputToken: TestERC20,
    targetPrice: BigNumberish,
    to: Wallet | string
  ): Promise<ContractTransaction> {
    const method = await inputToken.getAddress() === await token0.getAddress() ? swapTarget.swapToLowerSqrtPrice : swapTarget.swapToHigherSqrtPrice

    await inputToken.approve(await swapTarget.getAddress(), MaxUint256)

    const toAddress = typeof to === 'string' ? to : to.address

    return method(await pool.getAddress(), targetPrice, toAddress)
  }

  async function swap(
    inputToken: BaseContract & { approve: TypedContractMethod<[spender: AddressLike, amount: BigNumberish], [boolean], "nonpayable"> },
    [amountIn, amountOut]: [BigNumberish, BigNumberish],
    to: Wallet | string,
    sqrtPriceLimitX96?: BigNumberish
  ): Promise<ContractTransaction> {
    const exactInput = amountOut === 0
    const token0Address = await token0.getAddress()
    const inputTokenAddress = await inputToken.getAddress()

    const method =
      inputTokenAddress === token0Address
        ? exactInput
          ? swapTarget.swapExact0For1
          : swapTarget.swap0ForExact1
        : exactInput
        ? swapTarget.swapExact1For0
        : swapTarget.swap1ForExact0

    if (typeof sqrtPriceLimitX96 === 'undefined') {
      if (inputTokenAddress === token0Address) {
        sqrtPriceLimitX96 = MIN_SQRT_RATIO + 1n
      } else {
        sqrtPriceLimitX96 = MAX_SQRT_RATIO - 1n
      }
    }
    await inputToken.approve(await swapTarget.getAddress(), MaxUint256)

    const toAddress = typeof to === 'string' ? to : to.address

    return method(await pool.getAddress(), exactInput ? amountIn : amountOut, toAddress, sqrtPriceLimitX96)
  }

  const swapToLowerPrice: SwapToPriceFunction = (sqrtPriceX96, to) => {
    return swapToSqrtPrice(token0 as any, sqrtPriceX96, to)
  }

  const swapToHigherPrice: SwapToPriceFunction = (sqrtPriceX96, to) => {
    return swapToSqrtPrice(token1 as any, sqrtPriceX96, to)
  }

  const swapExact0For1: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
    return swap(token0 as any, [amount, 0], to, sqrtPriceLimitX96)
  }

  const swap0ForExact1: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
    return swap(token0 as any, [0, amount], to, sqrtPriceLimitX96)
  }

  const swapExact1For0: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
    return swap(token1 as any, [amount, 0], to, sqrtPriceLimitX96)
  }

  const swap1ForExact0: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
    return swap(token1 as any, [0, amount], to, sqrtPriceLimitX96)
  }

  const mint: MintFunction = async (recipient, tickLower, tickUpper, liquidity) => {
    await token0.approve(await swapTarget.getAddress(), MaxUint256)
    await token1.approve(await swapTarget.getAddress(), MaxUint256)
    return swapTarget.mint(await pool.getAddress(), recipient, tickLower, tickUpper, liquidity)
  }

  const flash: FlashFunction = async (amount0, amount1, to, pay0?: BigNumberish, pay1?: BigNumberish) => {
    const fee = await pool.fee()
    if (typeof pay0 === 'undefined') {
      const amount0BigInt = BigInt(amount0.toString())
      const feeBigInt = BigInt(fee)
      pay0 = (amount0BigInt * feeBigInt + 999999n) / 1000000n + amount0BigInt
    }
    if (typeof pay1 === 'undefined') {
      const amount1BigInt = BigInt(amount1.toString())
      const feeBigInt = BigInt(fee)
      pay1 = (amount1BigInt * feeBigInt + 999999n) / 1000000n + amount1BigInt
    }
    return swapTarget.flash(
      await pool.getAddress(), 
      typeof to === 'string' ? to : to.address, 
      amount0, 
      amount1, 
      pay0, 
      pay1
    )
  }

  return {
    swapToLowerPrice,
    swapToHigherPrice,
    swapExact0For1,
    swap0ForExact1,
    swapExact1For0,
    swap1ForExact0,
    mint,
    flash,
  }
}

export interface MultiPoolFunctions {
  swapForExact0Multi: SwapFunction
  swapForExact1Multi: SwapFunction
}

export function createMultiPoolFunctions({
  inputToken,
  swapTarget,
  poolInput,
  poolOutput,
}: {
  inputToken: TestERC20
  swapTarget: TestUniswapV3Router
  poolInput: MockTimeUniswapV3Pool
  poolOutput: MockTimeUniswapV3Pool
}): MultiPoolFunctions {
  async function swapForExact0Multi(amountOut: BigNumberish, to: Wallet | string): Promise<ContractTransaction> {
    const method = swapTarget.swapForExact0Multi
    await inputToken.approve(await swapTarget.getAddress(), MaxUint256)
    const toAddress = typeof to === 'string' ? to : to.address
    return method(toAddress, await poolInput.getAddress(), await poolOutput.getAddress(), amountOut)
  }

  async function swapForExact1Multi(amountOut: BigNumberish, to: Wallet | string): Promise<ContractTransaction> {
    const method = swapTarget.swapForExact1Multi
    await inputToken.approve(await swapTarget.getAddress(), MaxUint256)
    const toAddress = typeof to === 'string' ? to : to.address
    return method(toAddress, await poolInput.getAddress(), await poolOutput.getAddress(), amountOut)
  }

  return {
    swapForExact0Multi,
    swapForExact1Multi,
  }
}

// get the n wallets from hardhat config
export function getWallets(n: number): Wallet[] {
  const provider = new ethers.JsonRpcProvider(hre.network.config.url);
  const accounts = hre.network.config.accounts as string[];
  const allWallets = accounts.map((account: string) => new Wallet(account, provider));
  return allWallets.slice(0, n);
}