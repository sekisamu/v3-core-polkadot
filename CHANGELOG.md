# Changelog

## Status
-[x] Compiling

## Modification Record

| Change Type                     | Description & Cause                                                                                            | Files Affected                                                                                                                                                                                                                                                                                                                              |
| :------------------------------ | :------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Solidity Version Upgrade**    | Solidity version upgraded from 0.5.x to 0.8.x <br>   Contract Inheritance Structure Changes <br>  Number Type Conversions <br> introduce check/unchecked for safemath      | contracts/libraries/FullMath.sol <br>contracts/libraries/Oracle.sol <br>contracts/libraries/TickBitmap.sol <br>contracts/libraries/TickMath.sol <br>contracts/test/OracleEchidnaTest.sol <br>contracts/test/TickEchidnaTest.sol <br>contracts/UniswapV3Pool.sol <br>contracts/UniswapV3PoolDeployer.sol <br>contracts/libraries/LiquidityMath.sol <br>   |
| **Test Workflow**               | 1. Test framework migrates from Waffle to Hardhat, <br>2. ethersv5 upgrade to ethersv6                         | test/BitMath.spec.ts <br>test/FullMath.spec.ts <br>test/LiquidityMath.spec.ts <br>test/NoDelegateCall.spec.ts <br>test/Oracle.spec.ts <br>test/SqrtPriceMath.spec.ts <br>test/SwapMath.spec.ts <br>test/Tick.spec.ts <br>test/TickBitmap.spec.ts <br>test/TickMath.spec.ts <br>test/UniswapV3Factory.spec.ts <br>test/UniswapV3Pool.arbitrage.spec.ts <br>test/UniswapV3Pool.gas.spec.ts <br>test/UniswapV3Pool.spec.ts <br>test/UniswapV3Pool.swaps.spec.ts <br>test/UniswapV3Router.spec.ts <br>test/shared/checkObservationEquals.ts <br>test/shared/expect.ts <br>test/shared/fixtures.ts <br>test/shared/format.ts <br>test/shared/snapshotGasCost.ts <br>test/shared/utilities.ts |
| **EVM to PVM** | Core changes to smart contract logic due to a fundamental incompatibility between the EVM and PolkaVM runtime. | |                                                                                                                                                                                                                                         |

---

## Issue Reporting

