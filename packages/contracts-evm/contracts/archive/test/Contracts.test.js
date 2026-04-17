const { expect } = require("chai");
const { setupWaifuFunSuite } = require("./helpers/deployment");

describe("WaifuFun Contract Deployment", function () {
    before(async function () {
        Object.assign(this, await setupWaifuFunSuite());
    });

    it("wires the factory to the main contract", async function () {
        expect(await this.WaifuFun.factory()).to.equal(
            this.WaifuFunTokenFactory.address
        );
        expect(await this.WaifuFunTokenFactory.owner()).to.equal(
            this.WaifuFun.address
        );
    });

    it("keeps the expected owner and global config", async function () {
        const onChainConfig = await this.WaifuFun.globalConfig();

        expect(await this.WaifuFun.owner()).to.equal(this.deployer.address);
        expect(onChainConfig.teamWallet).to.equal(this.teamWallet.address);
        expect(onChainConfig.buyFee.toString()).to.equal(
            this.globalConfig.buyFee.toString()
        );
        expect(onChainConfig.sellFee.toString()).to.equal(
            this.globalConfig.sellFee.toString()
        );
    });
});
