import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider'
import { expect } from './expect'
import { Contract, ContractTransaction } from 'ethers'

export default async function snapshotGasCost(
  x:
    | TransactionResponse
    | Promise<TransactionResponse>
    | ContractTransaction
    | Promise<ContractTransaction>
    | TransactionReceipt
    | Promise<bigint>
    | bigint
    | Contract
    | Promise<Contract>
    | number
    | Promise<number>
): Promise<void> {
  const resolved = await x
  if (typeof resolved === 'number' || typeof resolved === 'bigint') {
    expect(Number(resolved)).toMatchSnapshot()
  } else if ('wait' in resolved) {
    const waited = await resolved.wait()
    expect(waited.gasUsed.toNumber()).toMatchSnapshot()
  } else if (typeof resolved === 'object' && resolved !== null && 'toString' in resolved) {
    expect(Number(resolved)).toMatchSnapshot()
  }
}
