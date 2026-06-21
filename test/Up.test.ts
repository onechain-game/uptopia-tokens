import { expect } from "chai";
import { network } from "hardhat";
import { parseEther, ZeroAddress } from "ethers";

const { ethers } = await network.connect();

describe("Up", function () {
  let signers: Awaited<ReturnType<typeof ethers.getSigners>>;
  let factory: Awaited<ReturnType<typeof ethers.getContractFactory>>;

  before(async function () {
    signers = await ethers.getSigners();
    factory = await ethers.getContractFactory("Up");
  });

  it("has name 'Uptopia' and symbol 'UP'", async function () {
    const up: any = await factory.deploy(signers[1].address);

    expect(await up.name()).to.equal("Uptopia");
    expect(await up.symbol()).to.equal("UP");
  });

  it("has 18 decimals", async function () {
    const up: any = await factory.deploy(signers[1].address);

    expect(await up.decimals()).to.equal(18n);
  });

  it("mints the fixed 500M supply to the receiver", async function () {
    const up: any = await factory.deploy(signers[1].address);

    expect(await up.totalSupply()).to.equal(parseEther("500000000"));
    expect(await up.balanceOf(signers[1].address)).to.equal(parseEther("500000000"));
    expect(await up.balanceOf(signers[0].address)).to.equal(0n);
    expect(await up.balanceOf(await up.getAddress())).to.equal(0n);
  });

  it("reverts when receiver is zero address", async function () {
    await expect(factory.deploy(ZeroAddress))
      .to.be.revertedWithCustomError(factory, "ZeroReceiver");
  });
});
