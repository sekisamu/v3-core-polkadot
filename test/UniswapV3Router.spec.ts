import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { TestERC20 } from '../typechain-types/test/TestERC20';
import { UniswapV3Factory } from '../typechain-types/UniswapV3Factory';
import { MockTimeUniswapV3Pool } from '../typechain-types/test/MockTimeUniswapV3Pool';
import { expect } from "chai";
import { poolFixture } from './shared/fixtures';

import {
  FeeAmount,
  TICK_SPACINGS,
  createPoolFunctions,
  PoolFunctions,
  createMultiPoolFunctions,
  encodePriceSqrt,
  getMinTick,
  getMaxTick,
  expandTo18Decimals,
} from './shared/utilities'
import { TestUniswapV3Router } from '../typechain-types/test/TestUniswapV3Router'
import { TestUniswapV3Callee } from '../typechain-types/test/TestUniswapV3Callee'

const feeAmount = FeeAmount.MEDIUM;
const tickSpacing = TICK_SPACINGS[feeAmount];

interface Fixture {
  wallet: SignerWithAddress;
  other: SignerWithAddress;
  token0: any;
  token1: any;
  token2: any;
  factory: any;
  pool0: any;
  pool1: any;
  pool0Functions: PoolFunctions;
  pool1Functions: PoolFunctions;
  swapTargetCallee: any;
  swapTargetRouter: any;
  minTick: number;
  maxTick: number;
}

describe('UniswapV3Pool', () => {
  let wallet: SignerWithAddress;
  let other: SignerWithAddress;

  let token0: TestERC20;
  let token1: TestERC20;
  let token2: TestERC20;
  let factory: UniswapV3Factory;
  let pool0: MockTimeUniswapV3Pool;
  let pool1: MockTimeUniswapV3Pool;

  let pool0Functions: PoolFunctions;
  let pool1Functions: PoolFunctions;

  let minTick: number;
  let maxTick: number;

  let swapTargetCallee: TestUniswapV3Callee;
  let swapTargetRouter: TestUniswapV3Router;

  async function deployFixture(): Promise<Fixture> {
    const [walletSigner, otherSigner] = await ethers.getSigners();
    const fixture = await poolFixture();
    const { token0, token1, token2, factory, createPool, swapTargetCallee, swapTargetRouter } = fixture as unknown as {
      token0: any;
      token1: any;
      token2: any;
      factory: any;
      createPool: any;
      swapTargetCallee: any;
      swapTargetRouter: any;
    };

    const createPoolWrapped = async (
      amount: number,
      spacing: number,
      firstToken: TestERC20,
      secondToken: TestERC20
    ): Promise<[MockTimeUniswapV3Pool, PoolFunctions]> => {
      const pool = await createPool(amount, spacing, firstToken, secondToken);
      const poolFunctions = createPoolFunctions({
        swapTarget: swapTargetCallee,
        token0: firstToken,
        token1: secondToken,
        pool,
      });
      return [pool, poolFunctions];
    };

    // default to the 30 bips pool
    const [pool0, pool0Functions] = await createPoolWrapped(feeAmount, tickSpacing, token0, token1);
    const [pool1, pool1Functions] = await createPoolWrapped(feeAmount, tickSpacing, token1, token2);
    const minTick = getMinTick(tickSpacing);
    const maxTick = getMaxTick(tickSpacing);

    return {
      wallet: walletSigner,
      other: otherSigner,
      token0,
      token1,
      token2,
      factory,
      pool0,
      pool1,
      pool0Functions,
      pool1Functions,
      swapTargetCallee,
      swapTargetRouter,
      minTick,
      maxTick
    };
  }

  it('constructor initializes immutables', async () => {
    const { factory, token0, token1, token2, pool0, pool1 } = await deployFixture();
    
    expect(await pool0.factory()).to.eq(factory.address);
    expect(await pool0.token0()).to.eq(token0.address);
    expect(await pool0.token1()).to.eq(token1.address);
    expect(await pool1.factory()).to.eq(factory.address);
    expect(await pool1.token0()).to.eq(token1.address);
    expect(await pool1.token1()).to.eq(token2.address);
  });

  describe('multi-swaps', () => {
    let inputToken: any;
    let outputToken: any;

    beforeEach('initialize both pools', async () => {
      const { token0, token2, pool0, pool1, pool0Functions, pool1Functions, wallet, minTick, maxTick } = await deployFixture();
      
      inputToken = token0;
      outputToken = token2;

      await pool0.initialize(encodePriceSqrt(BigInt(1), BigInt(1)));
      await pool1.initialize(encodePriceSqrt(BigInt(1), BigInt(1)));

      await pool0Functions.mint(wallet.address, minTick, maxTick, expandTo18Decimals(BigInt(1)));
      await pool1Functions.mint(wallet.address, minTick, maxTick, expandTo18Decimals(BigInt(1)));
    });

    it('multi-swap', async () => {
      const { token0, token1, pool0, pool1, wallet, swapTargetRouter } = await deployFixture();
      
      const token0OfPoolOutput = await pool1.token0();
      const ForExact0 = outputToken.address === token0OfPoolOutput;

      const { swapForExact0Multi, swapForExact1Multi } = createMultiPoolFunctions({
        inputToken: token0,
        swapTarget: swapTargetRouter,
        poolInput: pool0,
        poolOutput: pool1,
      });

      const method = ForExact0 ? swapForExact0Multi : swapForExact1Multi;

      await expect(method(BigInt(100), wallet.address))
        .to.emit(outputToken, 'Transfer')
        .withArgs(pool1.address, wallet.address, BigInt(100))
        .to.emit(token1, 'Transfer')
        .withArgs(pool0.address, pool1.address, BigInt(102))
        .to.emit(inputToken, 'Transfer')
        .withArgs(wallet.address, pool0.address, BigInt(104));
    });
  })
})
