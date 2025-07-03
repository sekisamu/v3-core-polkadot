import { ethers } from 'hardhat'
import { expect } from './shared/expect'
import snapshotGasCost from './shared/snapshotGasCost'

describe('NoDelegateCall', () => {
  let signer: any
  let otherSigner: any
  let base: any
  let proxy: any

  before('setup signers and deploy contracts', async () => {
    [signer, otherSigner] = await ethers.getSigners()

    // Deploy base contract
    const noDelegateCallTestFactory = await ethers.getContractFactory('NoDelegateCallTest')
    base = await noDelegateCallTestFactory.deploy()

    // Deploy proxy using minimal proxy pattern
    const minimalProxyFactory = new ethers.ContractFactory(
      noDelegateCallTestFactory.interface,
      `3d602d80600a3d3981f3363d3d373d3d3d363d73${base.address.slice(2)}5af43d82803e903d91602b57fd5bf3`,
      signer
    )
    proxy = await minimalProxyFactory.deploy()
  })

  it('measures runtime overhead of delegate call protection', async () => {
    const cannotBeDelegateCalledGas = await base.getGasCostOfCannotBeDelegateCalled()
    const canBeDelegateCalledGas = await base.getGasCostOfCanBeDelegateCalled()
    await snapshotGasCost(cannotBeDelegateCalledGas - canBeDelegateCalledGas)
  })

  it('allows proxy to call method without delegate call protection', async () => {
    await proxy.canBeDelegateCalled()
  })

  it('prevents proxy from calling method with delegate call protection', async () => {
    await expect(proxy.cannotBeDelegateCalled()).to.be.reverted
  })

  it('allows direct calls to method that uses delegate call protection internally', async () => {
    await base.callsIntoNoDelegateCallFunction()
  })

  it('prevents proxy calls to method that uses delegate call protection internally', async () => {
    await expect(proxy.callsIntoNoDelegateCallFunction()).to.be.reverted
  })
})
