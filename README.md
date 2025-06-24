# deterministic-deploy-polkadot

A toolset for deterministic smart contract deployment on the Polkadot ecosystem.

## Features

- Deterministic contract address calculation
- Support PolkaVM

## Getting Started

### Installation

```bash
git clone https://github.com/sekisamu/deterministic-deploy-polkadot.git
cd deterministic-deploy-polkadot
pnpm install
```

### Configuration

1. Create a `.env` file in the project root directory. Add the following environment variables (replace with your actual values):

```env
LOCAL_PRIV_KEY=
AH_PRIV_KEY=
```

2. Specify the revive compiler path in your configuration (e.g., in your deployment script or config file):

```json
{
  "compilerPath": "/absolute/path/to/resolc"
}
```

3. Install the latest `solc` package and set it in `.env` file:
   The final `.env` file would include these field:

```
LOCAL_PRIV_KEY=
AH_PRIV_KEY=
SOLC_PATH=
```

## How to Run

### Compile Yul Contracts

To compile your Yul contracts, use the following command:

```bash
npx hardhat compile:yul
```

This will compile all Yul contracts in the designated contracts directory using the specified compiler.

### Run Deployment Script

To deploy your contract, run the deployment script with:

```bash
USE_POLKAVM=true npx hardhat run scripts/deploy-proxy.ts --network local
```
switch to `--network ah` if you want to deploy it onto assethub-westend.


To Test, run:
```
USE_POLKAVM=true npx hardhat test --network local
```
Make sure your `.env` and configuration files are properly set up before running these commands.
