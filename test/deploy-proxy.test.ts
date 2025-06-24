import { ethers } from "hardhat";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { BaseContract, Contract, ContractFactory } from "ethers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Proxy Deployment", function () {
  let deployer: SignerWithAddress;
  let proxy: BaseContract;
  let proxyAddress: string;
  let Storage: ContractFactory;
  let storageBytecode: string;

  before(async function () {
    [deployer] = await ethers.getSigners();

    // Read proxy bytecode
    const bytecodePath = path.join(__dirname, "..", "output", "bytecode.txt");
    const proxyBytecode = fs.readFileSync(bytecodePath, "utf8").trim();

    // Deploy proxy
    const ProxyFactory = new ethers.ContractFactory([], proxyBytecode, deployer);
    proxy = await ProxyFactory.deploy();
    await proxy.waitForDeployment();
    proxyAddress = await proxy.getAddress();

    // Get Storage contract factory and bytecode
    Storage = await ethers.getContractFactory("Storage");
    
    const storage = await Storage.deploy();
    await storage.waitForDeployment();
    storageBytecode = await deployer.provider!.getCode(await storage.getAddress());
  });

  it("Should deploy the Storage contract through the proxy using CREATE2", async function () {
    const storageBytecodeHash = ethers.keccak256(storageBytecode);
    const salt = ethers.randomBytes(32);

    // Deploy using the proxy
    const calldata = ethers.concat([salt, storageBytecodeHash]);
    const tx = await deployer.sendTransaction({
      to: proxyAddress,
      data: calldata,
    });
    await tx.wait();

    // Calculate the deployed address
    const deployedAddress = ethers.getCreate2Address(
      proxyAddress,
      salt,
      storageBytecodeHash
    );

    // Verify the deployment
    const code = await ethers.provider.getCode(deployedAddress);
    expect(code).to.not.equal("0x");

    // Interact with the deployed contract
    const storageInstance = new ethers.Contract(deployedAddress, Storage.interface, deployer);
    
    const initialValue = await storageInstance.getValue();
    expect(initialValue).to.equal(0);

    const storeTx = await storageInstance.setValue(42);
    await storeTx.wait();

    const newValue = await storageInstance.getValue();
    expect(newValue).to.equal(42);
  });
});