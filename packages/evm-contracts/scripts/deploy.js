const { ethers } = require("hardhat");
const { deployProxy } = require("hardhat-libutils");
const { getDeploymentParams } = require("./params");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying AutoFun with wallet: ", deployer.address);

    const AutoFunTokenFactory = await deployProxy(
        "AutoFunTokenFactory",
        "AutoFunTokenFactory"
    );
    const globalConfig = getDeploymentParams();
    const AutoFun = await deployProxy("AutoFun", "AutoFun", [globalConfig]);

    // transfer AutoFunTokenFactory's ownership to AutoFun contract
    let tx = await AutoFunTokenFactory.transferOwnership(AutoFun.address);
    await tx.wait();

    // set AutoFunTokenFactory address
    tx = await AutoFun.updateFactory(AutoFunTokenFactory.address);
    await tx.wait();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
