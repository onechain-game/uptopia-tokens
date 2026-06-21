import { expect } from "chai";
import { network } from "hardhat";
import { parseEther, ZeroAddress } from "ethers";

const { ethers } = await network.connect();

const THREE_MONTHS = 90 * 24 * 60 * 60;
const SIX_MONTHS = 180 * 24 * 60 * 60;
const ONE_YEAR = 365 * 24 * 60 * 60;
const TWO_YEARS = 730 * 24 * 60 * 60;

async function getTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

async function setNextTimestamp(ts: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [ts]);
  await ethers.provider.send("evm_mine", []);
}

function buildTokenomicsParams(signers: Awaited<ReturnType<typeof ethers.getSigners>>) {
  return [
    [signers[1].address, parseEther("100000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("10000000"), false],
    [signers[2].address, parseEther("25000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("2500000"), false],
    [signers[3].address, parseEther("25000000"), parseEther("25000000"), 0, 0, 0, true],
    [signers[4].address, parseEther("75000000"), parseEther("18750000"), SIX_MONTHS, THREE_MONTHS, parseEther("7500000"), false],
    [signers[5].address, parseEther("70000000"), parseEther("35000000"), SIX_MONTHS, THREE_MONTHS, parseEther("7000000"), false],
    [signers[6].address, parseEther("30000000"), parseEther("30000000"), 0, 0, 0, true],
    [signers[7].address, parseEther("50000000"), 0n, ONE_YEAR, THREE_MONTHS, parseEther("5000000"), false],
    [signers[8].address, parseEther("100000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("10000000"), false],
    [signers[9].address, parseEther("25000000"), 0n, TWO_YEARS, THREE_MONTHS, parseEther("2500000"), false],
  ];
}

describe("TokenDistributor", function () {
  let signers: Awaited<ReturnType<typeof ethers.getSigners>>;
  let upFactory: Awaited<ReturnType<typeof ethers.getContractFactory>>;
  let distributorFactory: Awaited<ReturnType<typeof ethers.getContractFactory>>;

  before(async function () {
    signers = await ethers.getSigners();
    upFactory = await ethers.getContractFactory("Up");
    distributorFactory = await ethers.getContractFactory("TokenDistributor");
  });

  async function deployFundedDistributor(params = buildTokenomicsParams(signers)) {
    const up: any = await upFactory.deploy(signers[0].address);
    const distributor: any = await distributorFactory.deploy(await up.getAddress(), params);
    await up.transfer(await distributor.getAddress(), parseEther("500000000"));
    return { up, distributor };
  }

  describe("deployment validation", function () {
    it("sets immutable state correctly", async function () {
      const params = buildTokenomicsParams(signers);
      const { up, distributor } = await deployFundedDistributor(params);

      expect(await distributor.token()).to.equal(await up.getAddress());
      expect(await distributor.admin()).to.equal(signers[0].address);
      expect(await distributor.allocationCount()).to.equal(9n);
      expect(await distributor.totalAllocated()).to.equal(parseEther("500000000"));
    });

    it("reverts with zero token", async function () {
      await expect(distributorFactory.deploy(ZeroAddress, buildTokenomicsParams(signers)))
        .to.be.revertedWithCustomError(distributorFactory, "ZeroToken");
    });

    it("reverts with empty allocations", async function () {
      const up: any = await upFactory.deploy(signers[0].address);

      await expect(distributorFactory.deploy(await up.getAddress(), []))
        .to.be.revertedWithCustomError(distributorFactory, "EmptyAllocations");
    });

    it("reverts with zero beneficiary", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const bad = [[ZeroAddress, parseEther("1"), parseEther("1"), 0, 0, 0, true]];

      await expect(distributorFactory.deploy(await up.getAddress(), bad))
        .to.be.revertedWithCustomError(distributorFactory, "ZeroBeneficiary");
    });

    it("reverts when tgeAmount exceeds totalAmount", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const bad = [[signers[1].address, parseEther("100"), parseEther("200"), 0, 0, 0, false]];

      await expect(distributorFactory.deploy(await up.getAddress(), bad))
        .to.be.revertedWithCustomError(distributorFactory, "TGEExceedsTotal");
    });

    it("reverts when vesting interval is missing for vested allocation", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const bad = [[signers[1].address, parseEther("100"), 0n, SIX_MONTHS, 0, parseEther("10"), false]];

      await expect(distributorFactory.deploy(await up.getAddress(), bad))
        .to.be.revertedWithCustomError(distributorFactory, "MissingVestingInterval");
    });

    it("reverts when amount per interval is missing for vested allocation", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const bad = [[signers[1].address, parseEther("100"), 0n, SIX_MONTHS, THREE_MONTHS, 0, false]];

      await expect(distributorFactory.deploy(await up.getAddress(), bad))
        .to.be.revertedWithCustomError(distributorFactory, "MissingAmountPerInterval");
    });

    it("reverts when instant release is not fully unlocked", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const bad = [[signers[1].address, parseEther("100"), parseEther("10"), 0, 0, 0, true]];

      await expect(distributorFactory.deploy(await up.getAddress(), bad))
        .to.be.revertedWithCustomError(distributorFactory, "InstantMustBeFullTGE");
    });
  });

  describe("instant release", function () {
    it("lets instant beneficiaries claim immediately after funding", async function () {
      const { up, distributor } = await deployFundedDistributor();

      await distributor.connect(signers[3]).claim(2);
      await distributor.connect(signers[6]).claim(5);

      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("25000000"));
      expect(await up.balanceOf(signers[6].address)).to.equal(parseEther("30000000"));
      expect(await up.balanceOf(await distributor.getAddress())).to.equal(parseEther("445000000"));
    });

    it("tracks instant allocations as claimable before claim and fully claimed after claim", async function () {
      const { distributor } = await deployFundedDistributor();

      expect(await distributor.vested(2)).to.equal(parseEther("25000000"));
      expect(await distributor.claimable(2)).to.equal(parseEther("25000000"));

      await distributor.connect(signers[3]).claim(2);
      const pubSale = await distributor.getAllocation(2);

      expect(pubSale.claimed).to.equal(parseEther("25000000"));
      expect(pubSale.instantRelease).to.equal(true);
      expect(await distributor.claimable(2)).to.equal(0n);
    });

    it("reverts when claiming an unfunded instant allocation", async function () {
      const up: any = await upFactory.deploy(signers[0].address);
      const distributor: any = await distributorFactory.deploy(await up.getAddress(), buildTokenomicsParams(signers));

      await expect(distributor.connect(signers[3]).claim(2))
        .to.be.revertedWithCustomError(up, "ERC20InsufficientBalance");
    });
  });

  describe("TGE activation", function () {
    it("only admin can call startTGE", async function () {
      const { distributor } = await deployFundedDistributor();

      await expect(distributor.connect(signers[1]).startTGE())
        .to.be.revertedWithCustomError(distributor, "NotAdmin");
    });

    it("sets tge to block.timestamp and emits event", async function () {
      const { distributor } = await deployFundedDistributor();

      await expect(distributor.startTGE()).to.emit(distributor, "TGEStarted");
      const ts = await getTimestamp();
      expect(await distributor.tge()).to.equal(BigInt(ts));
    });

    it("cannot be called twice", async function () {
      const { distributor } = await deployFundedDistributor();

      await distributor.startTGE();
      await expect(distributor.startTGE())
        .to.be.revertedWithCustomError(distributor, "TGEAlreadyStarted");
    });
  });

  describe("vesting logic", function () {
    let up: any;
    let distributor: any;
    let tge: number;
    let snapshot: string;

    const INSTANT = 0;
    const NO_TGE = 1;
    const TGE_25 = 2;
    const TGE_50 = 3;

    before(async function () {
      const params = [
        [signers[1].address, parseEther("125000000"), parseEther("125000000"), 0, 0, 0, true],
        [signers[2].address, parseEther("125000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("12500000"), false],
        [signers[3].address, parseEther("125000000"), parseEther("31250000"), SIX_MONTHS, THREE_MONTHS, parseEther("12500000"), false],
        [signers[4].address, parseEther("125000000"), parseEther("62500000"), SIX_MONTHS, THREE_MONTHS, parseEther("12500000"), false],
      ];
      up = await upFactory.deploy(signers[0].address);
      distributor = await distributorFactory.deploy(await up.getAddress(), params);
      await up.transfer(await distributor.getAddress(), parseEther("500000000"));
      await distributor.startTGE();
      tge = await getTimestamp();
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async function () {
      await ethers.provider.send("evm_revert", [snapshot]);
      snapshot = await ethers.provider.send("evm_snapshot", []);
    });

    it("instant allocation is claimable before TGE and transfers on claim", async function () {
      await distributor.connect(signers[1]).claim(INSTANT);

      expect(await up.balanceOf(signers[1].address)).to.equal(parseEther("125000000"));
    });

    it("vesting allocations return 0 claimable before TGE is started", async function () {
      const params = [[signers[1].address, parseEther("500000000"), 0n, SIX_MONTHS, THREE_MONTHS, parseEther("50000000"), false]];
      const fresh: any = await distributorFactory.deploy(await up.getAddress(), params);

      expect(await fresh.vested(0)).to.equal(0n);
      expect(await fresh.claimable(0)).to.equal(0n);
    });

    it("TGE 0% unlocks first period at cliff end and then steps", async function () {
      expect(await distributor.vested(NO_TGE)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await distributor.vested(NO_TGE)).to.equal(0n);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await distributor.vested(NO_TGE)).to.equal(parseEther("12500000"));

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      expect(await distributor.vested(NO_TGE)).to.equal(parseEther("25000000"));
    });

    it("caps vested amount at totalAmount", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 20);

      expect(await distributor.vested(NO_TGE)).to.equal(parseEther("125000000"));
    });

    it("TGE 25% has TGE amount immediately and steps after cliff", async function () {
      const tgeAmt = parseEther("31250000");
      const step = parseEther("12500000");

      expect(await distributor.vested(TGE_25)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS - 1);
      expect(await distributor.vested(TGE_25)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      expect(await distributor.vested(TGE_25)).to.equal(tgeAmt + step);
    });

    it("TGE 50% is fully vested after five periods", async function () {
      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS * 4);

      expect(await distributor.vested(TGE_50)).to.equal(parseEther("125000000"));
    });

    it("partial periods do not release early", async function () {
      const step = parseEther("12500000");

      await setNextTimestamp(tge + SIX_MONTHS + Math.floor(THREE_MONTHS / 2));
      expect(await distributor.vested(NO_TGE)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS - 1);
      expect(await distributor.vested(NO_TGE)).to.equal(step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      expect(await distributor.vested(NO_TGE)).to.equal(step * 2n);
    });

    it("returns 0 vested for non-existent allocation", async function () {
      expect(await distributor.vested(99)).to.equal(0n);
      expect(await distributor.claimable(99)).to.equal(0n);
    });

    it("only beneficiary can claim", async function () {
      await expect(distributor.connect(signers[0]).claim(TGE_25))
        .to.be.revertedWithCustomError(distributor, "NotBeneficiary");
    });

    it("reverts when nothing is claimable", async function () {
      await expect(distributor.connect(signers[2]).claim(NO_TGE))
        .to.be.revertedWithCustomError(distributor, "NothingToClaim");
    });

    it("beneficiary can claim TGE amount and receives tokens", async function () {
      await distributor.connect(signers[3]).claim(TGE_25);

      expect(await up.balanceOf(signers[3].address)).to.equal(parseEther("31250000"));
    });

    it("emits Claimed event with correct args", async function () {
      await expect(distributor.connect(signers[3]).claim(TGE_25))
        .to.emit(distributor, "Claimed")
        .withArgs(TGE_25, signers[3].address, parseEther("31250000"));
    });

    it("multiple claims over time accumulate correctly", async function () {
      const tgeAmt = parseEther("31250000");
      const step = parseEther("12500000");

      await distributor.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt);

      await setNextTimestamp(tge + SIX_MONTHS);
      await distributor.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt + step);

      await setNextTimestamp(tge + SIX_MONTHS + THREE_MONTHS);
      await distributor.connect(signers[3]).claim(TGE_25);
      expect(await up.balanceOf(signers[3].address)).to.equal(tgeAmt + step * 2n);
    });
  });

  describe("full tokenomics", function () {
    it("all beneficiaries can receive their full allocations after full vesting", async function () {
      const { up, distributor } = await deployFundedDistributor();
      await distributor.startTGE();
      const tge = await getTimestamp();

      await distributor.connect(signers[3]).claim(2);
      await distributor.connect(signers[6]).claim(5);
      await setNextTimestamp(tge + TWO_YEARS + THREE_MONTHS * 10);

      const vestingIndices = [0, 1, 3, 4, 6, 7, 8];
      const vestingSigners = [1, 2, 4, 5, 7, 8, 9];
      for (let i = 0; i < vestingIndices.length; i++) {
        await distributor.connect(signers[vestingSigners[i]]).claim(vestingIndices[i]);
      }

      const expectedAmounts = [
        parseEther("100000000"),
        parseEther("25000000"),
        parseEther("25000000"),
        parseEther("75000000"),
        parseEther("70000000"),
        parseEther("30000000"),
        parseEther("50000000"),
        parseEther("100000000"),
        parseEther("25000000"),
      ];

      for (let i = 0; i < 9; i++) {
        expect(await up.balanceOf(signers[i + 1].address)).to.equal(expectedAmounts[i]);
      }

      expect(await up.balanceOf(await distributor.getAddress())).to.equal(0n);
    });
  });
});
