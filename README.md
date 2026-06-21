# Uptopia Tokens

Hardhat project for the Uptopia `UP` ERC-20 token and reusable token distribution contract.

## Contracts

- `Up`: fixed-supply ERC-20 token. The constructor mints `500,000,000 UP` to a receiver address.
- `TokenDistributor`: reusable ERC-20 distributor with immutable allocation schedules, instant claims, TGE activation, cliff, and interval vesting.

## Test

```shell
npx hardhat test
```

## Deploy UP

```shell
UP_RECEIVER=0x... npx hardhat run scripts/deploy.ts --network <network>
```

`UP_RECEIVER` receives the full token supply. Token distribution is intentionally not handled by `Up`.

## Deploy Distributor

```shell
UP_TOKEN=0x... \
EARLY_BACKERS=0x... \
STRATEGIC_BACKERS=0x... \
PUBLIC_SALE=0x... \
ECOSYSTEM_GROWTH=0x... \
COMMUNITY_DEV=0x... \
LIQUIDITY_PROVISION=0x... \
FOUNDATION_RESERVE=0x... \
CORE_CONTRIBUTORS=0x... \
ADVISORS=0x... \
npx hardhat run scripts/deploy-distributor.ts --network <network>
```

After deployment, transfer the required token amount to `TokenDistributor`. Instant-release beneficiaries can claim immediately after funding. Vesting allocations become claimable after the distributor admin calls `startTGE()`.
