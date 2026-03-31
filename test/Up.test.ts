import { expect } from "chai";
import { network } from "hardhat";
import { parseEther, ZeroAddress } from "ethers";

const { ethers } = await network.connect();

// ─── Time constants (seconds) ────────────────────────────────────────────────

const THREE_MONTHS = 90 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TWO_YEARS = 730 * 24 * 60 * 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

async function setNextTimestamp(ts: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
  await ethers.provider.send("evm_mine", []);
}

async function increaseTime(seconds: number): Promise<number> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
  return await getTimestamp();
}

/** Build the full 9-allocation tokenomics params using signers[1..9]. */
function buildTokenomicsParams(signers: Awaited<ReturnType<typeof ethers.getSigners>>) {
  return [
    // Early Backers – 100M, TGE 0%, 6 mo cliff, 10%/3mo
    [signers[1].address, parseEther("100000000"), 0n,                      SIX_MONTHS, THREE_MONTHS, parseEther("10000000"),  false],
    // Strategic Backers – 25M, TGE 0%, 6 mo cliff, 10%/3mo
    [signers[2].address, parseEther("25000000"),  0n,                      SIX_MONTHS, THREE_MONTHS, parseEther("2500000"),   false],
    // Public Sale – 25M, instant release
    [signers[3].address, parseEther("25000000"),  parseEther("25000000"),  0,          0,            0,                       true],
    // Ecosystem Growth – 75M, TGE 25%, 6 mo cliff, 10%/3mo
    [signers[4].address, parseEther("75000000"),  parseEther("18750000"),  SIX_MONTHS, THREE_MONTHS, parseEther("7500000"),   false],
    // Community Development – 70M, TGE 50%, 6 mo cliff, 10%/3mo
    [signers[5].address, parseEther("70000000"),  parseEther("35000000"),  SIX_MONTHS, THREE_MONTHS, parseEther("7000000"),   false],
    // Liquidity Provision – 30M, instant release
    [signers[6].address, parseEther("30000000"),  parseEther("30000000"),  0,          0,            0,                       true],
    // Foundation Reserve – 50M, TGE 0%, 1 yr cliff, 10%/3mo
    [signers[7].address, parseEther("50000000"),  0n,                      ONE_YEAR,   THREE_MONTHS, parseEther("5000000"),   false],
    // Core Contributors – 100M, TGE 0%, 2 yr cliff, 10%/3mo
    [signers[8].address, parseEther("100000000"), 0n,                      TWO_YEARS,  THREE_MONTHS, parseEther("10000000"),  false],
    // Advisors – 25M, TGE 0%, 2 yr cliff, 10%/3mo
    [signers[9].address, parseEther("25000000"),  0n,                      TWO_YEARS,  THREE_MONTHS, parseEther("2500000"),   false],
  ];
}

const INSTANT_TOTAL = parseEther("55000000"); // 25M + 30M

// ─── Up Token ────────────────────────────────────────────────────────────────

describe("Up", function () {
  let signers: Awaited<ReturnType<typeof ethers.getSigners>>;
  let factory: Awaited<ReturnType<typeof ethers.getContractFactory>>;

  before(async function () {
    signers = await ethers.getSigners();
    factory = await ethers.getContractFactory("Up");
  });

  // ── ERC-20 basics ───────────────────────────────────────────────────────

  describe("ERC-20", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let up: any;

    before(async function () {
      up = await factory.deploy(buildTokenomicsParams(signers));
    });

    it("should have name 'Uptopia' and symbol 'UP'", async function () {
      expect(await up.name()).to.equal("Uptopia");
      expect(await up.symbol()).to.equal("UP");
    });

    it("should have 18 decimals", async function () {
      expect(await up.decimals()).to.equal(18n);
    });

    it("should have total supply of 500M", async function () {
      expect(await up.totalSupply()).to.equal(parseEther("500000000"));
    });

    it("deployer should have zero balance", async function () {
      expect(await up.balanceOf(signers[0].address)).to.equal(0n);
    });
  });

  // ── Instant release ───────────────────────────────────────────────────────

  describe("Instant release", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let up: any;

    before(async function () {
      up = await factory.deploy(buildTokenomicsParams(signers));
    });

    it("Public Sale beneficiary receives 25M at deploy", async function () {
      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("25000000"));
    });

    it("Liquidity Provision beneficiary receives 30M at deploy", async function () {
      expect(await up.balanceOf(signers[6].address)).to.equal(parseEther("30000000"));
    });

    it("contract holds remaining 445M", async function () {
      const expected = parseEther("500000000") - INSTANT_TOTAL;
      expect(await up.balanceOf(await up.getAddress())).to.equal(expected);
    });

    it("instant allocations are fully claimed in storage", async function () {
      const pubSale = await up.getAllocation(2); // Public Sale
      expect(pubSale.claimed).to.equal(parseEther("25000000"));
      expect(pubSale.instantRelease).to.equal(true);

      const lp = await up.getAllocation(5); // Liquidity Provision
      expect(lp.claimed).to.equal(parseEther("30000000"));
      expect(lp.instantRelease).to.equal(true);
    });

    it("vested() returns totalAmount for instant allocations", async function () {
      expect(await up.vested(2)).to.equal(parseEther("25000000"));
      expect(await up.vested(5)).to.equal(parseEther("30000000"));
    });

    it("claimable() returns 0 for instant allocations", async function () {
      expect(await up.claimable(2)).to.equal(0n);
      expect(await up.claimable(5)).to.equal(0n);
    });

    it("claim() reverts for instant allocations (already claimed)", async function () {
      await expect(up.connect(signers[3]).claim(2))
        .to.be.revertedWithCustomError(up, "NothingToClaim");
    });

    it("instant-released tokens are freely transferable", async function () {
      const amount = parseEther("1000000");
      await up.connect(signers[3]).transfer(signers[0].address, amount);
      expect(await up.balanceOf(signers[0].address)).to.equal(amount);
    });
  });

  // ── TGE activation ────────────────────────────────────────────────────────

  describe("startTGE", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let up: any;
    let snapshot: string;

    before(async function () {
      up = await factory.deploy(buildTokenomicsParams(signers));
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    it("tge is 0 before startTGE", async function () {
      expect(await up.tge()).to.equal(0n);
    });

    it("only deployer can call startTGE", async function () {
      await expect(up.connect(signers[1]).startTGE())
        .to.be.revertedWithCustomError(up, "NotDeployer");
    });

    it("sets tge to block.timestamp", async function () {
      await up.startTGE();
      const ts = await getTimestamp();
      expect(await up.tge()).to.equal(BigInt(ts));
    });

    it("emits TGEStarted event", async function () {
      await expect(up.startTGE()).to.emit(up, "TGEStarted");
    });

    it("cannot be called twice", async function () {
      await up.startTGE();
      await expect(up.startTGE())
        .to.be.revertedWithCustomError(up, "TGEAlreadyStarted");
    });

    it("deployer address is correct", async function () {
      expect(await up.deployer()).to.equal(signers[0].address);
    });
  });

  // ── Deployment validation ─────────────────────────────────────────────────

  describe("Deployment validation", function () {
    it("should set immutable state correctly", async function () {
      const up = await factory.deploy(buildTokenomicsParams(signers));
      expect(await up.allocationCount()).to.equal(9n);
      expect(await up.totalAllocated()).to.equal(parseEther("500000000"));
    });

    it("should revert with empty allocations", async function () {
      await expect(factory.deploy([]))
        .to.be.revertedWithCustomError(factory, "EmptyAllocations");
    });

    it("should revert with zero beneficiary", async function () {
      const bad = [
        [ZeroAddress, parseEther("500000000"), parseEther("500000000"), 0, 0, 0, true],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "ZeroBeneficiary");
    });

    it("should revert when tgeAmount > totalAmount", async function () {
      const bad = [
        [signers[1].address, parseEther("100"), parseEther("200"), 0, 0, 0, false],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "TGEExceedsTotal");
    });

    it("should revert when vestingInterval is 0 but vesting is needed", async function () {
      const bad = [
        [signers[1].address, parseEther("500000000"), 0n, SIX_MONTHS, 0, parseEther("50000000"), false],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "MissingVestingInterval");
    });

    it("should revert when amountPerInterval is 0 but vesting is needed", async function () {
      const bad = [
        [signers[1].address, parseEther("500000000"), 0n, SIX_MONTHS, THREE_MONTHS, 0, false],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "MissingAmountPerInterval");
    });

    it("should revert when instantRelease but tgeAmount != totalAmount", async function () {
      const bad = [
        [signers[1].address, parseEther("500000000"), parseEther("100"), 0, 0, 0, true],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "InstantMustBeFullTGE");
    });

    it("should revert when total allocated != TOTAL_SUPPLY", async function () {
      const bad = [
        [signers[1].address, parseEther("100"), parseEther("100"), 0, 0, 0, true],
      ];
      await expect(factory.deploy(bad))
        .to.be.revertedWithCustomError(factory, "TotalAllocatedMismatch");
    });
  });

  // ── Vesting logic ─────────────────────────────────────────────────────────

  describe("Vesting logic", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let up: any;
    let tge: number;
    let snapshot: string;

    // Indices into the 4-allocation test fixture
    const INSTANT = 0;
    const NO_TGE = 1;
    const TGE_25 = 2;
    const TGE_50 = 3;

    before(async function () {
      // 4 allocations that sum to 500M
      const params = [
        [signers[1].address, parseEther("125000000"), parseEther("125000000"), 0,          0,            0,                       true],  // instant
        [signers[2].address, parseEther("125000000"), 0n,                      SIX_MONTHS, THREE_MONTHS, parseEther("12500000"),  false], // TGE 0%
        [signers[3].address, parseEther("125000000"), parseEther("31250000"),  SIX_MONTHS, THREE_MONTHS, parseEther("12500000"),  false], // TGE 25%
        [signers[4].address, parseEther("125000000"), parseEther("62500000"),  SIX_MONTHS, THREE_MONTHS, parseEther("12500000"),  false], // TGE 50%
      ];
      up = await factory.deploy(params);
      // Start TGE
      await up.startTGE();
      tge = await getTimestamp();
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    it("instant allocation already transferred at deploy", async function () {
      expect(await up.balanceOf(signers[1].address)).to.equal(parseEther("125000000"));
    });

    it("vesting allocations return 0 claimable before TGE is started", async function () {
      // Deploy a fresh contract without startTGE
      const params = [
        [signers[1].address, parseEther("500000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("50000000"), false],
      ];
      const fresh = await factory.deploy(params);
      expect(await fresh.vested(0)).to.equal(0n);
      expect(await fresh.claimable(0)).to.equal(0n);
    });

    it("TGE 0%: nothing at TGE, nothing during cliff", async function () {
      expect(await up.vested(NO_TGE)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await up.vested(NO_TGE)).to.equal(0n);
    });

    it("TGE 0%: first period at cliff end, step vesting after", async function () {
      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(NO_TGE)).to.equal(parseEther("12500000"));

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      expect(await up.vested(NO_TGE)).to.equal(parseEther("25000000"));

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 2);
      expect(await up.vested(NO_TGE)).to.equal(parseEther("37500000"));
    });

    it("TGE 0%: fully vested after 10 periods", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 9);
      expect(await up.vested(NO_TGE)).to.equal(parseEther("125000000"));
    });

    it("TGE 0%: caps at totalAmount after extra time", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 20);
      expect(await up.vested(NO_TGE)).to.equal(parseEther("125000000"));
    });

    it("TGE 25%: TGE amount at TGE, step vesting after cliff, caps correctly", async function () {
      const tgeAmt = parseEther("31250000");
      const step = parseEther("12500000");
      const total = parseEther("125000000");

      expect(await up.vested(TGE_25)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await up.vested(TGE_25)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(TGE_25)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 7);
      expect(await up.vested(TGE_25)).to.equal(total);
    });

    it("TGE 50%: TGE amount at TGE, fully vested after 5 periods", async function () {
      const tgeAmt = parseEther("62500000");
      const step = parseEther("12500000");
      const total = parseEther("125000000");

      expect(await up.vested(TGE_50)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(TGE_50)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 4);
      expect(await up.vested(TGE_50)).to.equal(total);
    });

    it("partial periods do not release early", async function () {
      const step = parseEther("12500000");

      await setNextTimestamp(tge + SIX_MONTHS + Math.floor(THREE_MONTHS / 2));
      expect(await up.vested(NO_TGE)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS - 1);
      expect(await up.vested(NO_TGE)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      expect(await up.vested(NO_TGE)).to.equal(step * 2n);
    });

    it("returns 0 vested for non-existent allocation", async function () {
      expect(await up.vested(99)).to.equal(0n);
      expect(await up.claimable(99)).to.equal(0n);
    });

    // ── Claiming ──────────────────────────────────────────────────────────

    it("only beneficiary can claim", async function () {
      await expect(up.connect(signers[0]).claim(TGE_25))
        .to.be.revertedWithCustomError(up, "NotBeneficiary");
    });

    it("reverts when nothing to claim (TGE 0% at TGE)", async function () {
      await expect(up.connect(signers[2]).claim(NO_TGE))
        .to.be.revertedWithCustomError(up, "NothingToClaim");
    });

    it("reverts when nothing to claim (already claimed everything)", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 20);
      await up.connect(signers[2]).claim(NO_TGE);
      await expect(up.connect(signers[2]).claim(NO_TGE))
        .to.be.revertedWithCustomError(up, "NothingToClaim");
    });

    it("beneficiary can claim TGE amount and receives tokens", async function () {
      // TGE_25 has 31.25M at TGE
      await up.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("31250000"));
    });

    it("emits Claimed event with correct args", async function () {
      await expect(up.connect(signers[3]).claim(TGE_25))
        .to.emit(up, "Claimed")
        .withArgs(TGE_25, signers[3].address, parseEther("31250000"));
    });

    it("multiple claims over time accumulate correctly", async function () {
      const tgeAmt = parseEther("31250000");
      const step = parseEther("12500000");

      await up.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      await up.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      await up.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt + step * 2n);
    });

    it("claimed equals totalAmount after full vesting", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 9);
      await up.connect(signers[2]).claim(NO_TGE);
      const alloc = await up.getAllocation(NO_TGE);
      expect(alloc.claimed).to.equal(parseEther("125000000"));
      expect(await up.claimable(NO_TGE)).to.equal(0n);
    });

    it("late single claim receives full amount", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 20);
      await up.connect(signers[2]).claim(NO_TGE);
      expect(await up.balanceOf(signers[2].address)).to.equal(parseEther("125000000"));
    });
  });

  // ── Full tokenomics verification ──────────────────────────────────────────

  describe("Tokenomics", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let up: any;
    let tge: number;
    let snapshot: string;

    const EARLY_BACKERS = 0;
    const STRATEGIC_BACKERS = 1;
    const PUBLIC_SALE = 2;
    const ECOSYSTEM_GROWTH = 3;
    const COMMUNITY_DEV = 4;
    const LIQUIDITY_PROVISION = 5;
    const FOUNDATION_RESERVE = 6;
    const CORE_CONTRIBUTORS = 7;
    const ADVISORS = 8;

    before(async function () {
      const params = buildTokenomicsParams(signers);
      up = await factory.deploy(params);
      await up.startTGE();
      tge = await getTimestamp();
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    it("total allocated equals 500 000 000 UP", async function () {
      expect(await up.totalAllocated()).to.equal(parseEther("500000000"));
      expect(await up.allocationCount()).to.equal(9n);
    });

    it("Public Sale (25M) and Liquidity (30M) already with beneficiaries", async function () {
      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("25000000"));
      expect(await up.balanceOf(signers[6].address)).to.equal(parseEther("30000000"));
    });

    it("contract holds 445M (500M - 55M instant)", async function () {
      expect(await up.balanceOf(await up.getAddress())).to.equal(parseEther("445000000"));
    });

    it("Early Backers: 100M, TGE 0%, 6mo cliff, 10%/3mo", async function () {
      const id = EARLY_BACKERS;
      const total = parseEther("100000000");
      const step = parseEther("10000000");

      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(id)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      expect(await up.vested(id)).to.equal(step * 2n);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 9);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[1]).claim(id);
      expect(await up.balanceOf(signers[1].address)).to.equal(total);
    });

    it("Strategic Backers: 25M, TGE 0%, 6mo cliff, 10%/3mo", async function () {
      const id = STRATEGIC_BACKERS;
      const total = parseEther("25000000");
      const step = parseEther("2500000");

      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(id)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 9);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[2]).claim(id);
      expect(await up.balanceOf(signers[2].address)).to.equal(total);
    });

    it("Public Sale: 25M, instant release (already transferred)", async function () {
      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("25000000"));
      expect(await up.vested(PUBLIC_SALE)).to.equal(parseEther("25000000"));
      expect(await up.claimable(PUBLIC_SALE)).to.equal(0n);
    });

    it("Ecosystem Growth: 75M, TGE 25%, 6mo cliff, 10%/3mo", async function () {
      const id = ECOSYSTEM_GROWTH;
      const total = parseEther("75000000");
      const tgeAmt = parseEther("18750000");
      const step = parseEther("7500000");

      expect(await up.vested(id)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await up.vested(id)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(id)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 6);
      expect(await up.vested(id)).to.equal(tgeAmt + step * 7n);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 7);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[4]).claim(id);
      expect(await up.balanceOf(signers[4].address)).to.equal(total);
    });

    it("Community Development: 70M, TGE 50%, 6mo cliff, 10%/3mo", async function () {
      const id = COMMUNITY_DEV;
      const total = parseEther("70000000");
      const tgeAmt = parseEther("35000000");
      const step = parseEther("7000000");

      expect(await up.vested(id)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await up.vested(id)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 4);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[5]).claim(id);
      expect(await up.balanceOf(signers[5].address)).to.equal(total);
    });

    it("Liquidity Provision: 30M, instant release (already transferred)", async function () {
      expect(await up.balanceOf(signers[6].address)).to.equal(parseEther("30000000"));
      expect(await up.vested(LIQUIDITY_PROVISION)).to.equal(parseEther("30000000"));
      expect(await up.claimable(LIQUIDITY_PROVISION)).to.equal(0n);
    });

    it("Foundation Reserve: 50M, TGE 0%, 1yr cliff, 10%/3mo", async function () {
      const id = FOUNDATION_RESERVE;
      const total = parseEther("50000000");
      const step = parseEther("5000000");

      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + ONE_YEAR - 1);
      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + ONE_YEAR);
      expect(await up.vested(id)).to.equal(step);

      await setNextTimestamp(tge + ONE_YEAR + THREE_MONTHS * 9);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[7]).claim(id);
      expect(await up.balanceOf(signers[7].address)).to.equal(total);
    });

    it("Core Contributors: 100M, TGE 0%, 2yr cliff, 10%/3mo", async function () {
      const id = CORE_CONTRIBUTORS;
      const total = parseEther("100000000");
      const step = parseEther("10000000");

      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + TWO_YEARS - 1);
      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + TWO_YEARS);
      expect(await up.vested(id)).to.equal(step);

      await setNextTimestamp(tge + TWO_YEARS + THREE_MONTHS * 9);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[8]).claim(id);
      expect(await up.balanceOf(signers[8].address)).to.equal(total);
    });

    it("Advisors: 25M, TGE 0%, 2yr cliff, 10%/3mo", async function () {
      const id = ADVISORS;
      const total = parseEther("25000000");
      const step = parseEther("2500000");

      expect(await up.vested(id)).to.equal(0n);

      await setNextTimestamp(tge + TWO_YEARS);
      expect(await up.vested(id)).to.equal(step);

      await setNextTimestamp(tge + TWO_YEARS + THREE_MONTHS * 9);
      expect(await up.vested(id)).to.equal(total);

      await up.connect(signers[9]).claim(id);
      expect(await up.balanceOf(signers[9].address)).to.equal(total);
    });

    it("all beneficiaries can claim full allocations after full vesting", async function () {
      await setNextTimestamp(tge + TWO_YEARS + THREE_MONTHS * 10);

      // Claim vested allocations (skip instant ones: indices 2, 5)
      const vestingIndices = [0, 1, 3, 4, 6, 7, 8];
      const vestingSigners = [1, 2, 4, 5, 7, 8, 9];
      for (let i = 0; i < vestingIndices.length; i++) {
        await up.connect(signers[vestingSigners[i]]).claim(vestingIndices[i]);
      }

      const expectedAmounts = [
        parseEther("100000000"), // Early Backers
        parseEther("25000000"),  // Strategic Backers
        parseEther("25000000"),  // Public Sale (instant)
        parseEther("75000000"),  // Ecosystem Growth
        parseEther("70000000"),  // Community Dev
        parseEther("30000000"),  // Liquidity Provision (instant)
        parseEther("50000000"),  // Foundation Reserve
        parseEther("100000000"), // Core Contributors
        parseEther("25000000"),  // Advisors
      ];

      for (let i = 0; i < 9; i++) {
        expect(await up.balanceOf(signers[i + 1].address)).to.equal(expectedAmounts[i]);
      }

      // Contract should have zero balance
      expect(await up.balanceOf(await up.getAddress())).to.equal(0n);
    });
  });
});
