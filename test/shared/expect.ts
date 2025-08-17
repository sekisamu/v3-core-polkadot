import { expect, use } from 'chai'
import '@nomicfoundation/hardhat-toolbox'
import { jestSnapshotPlugin } from 'mocha-chai-jest-snapshot'

use(jestSnapshotPlugin())

export { expect }