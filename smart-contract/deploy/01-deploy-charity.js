const { network } = require("hardhat");
const { networkConfig, developmentChains } = require("../helper-hardhat.config");
const { verify } = require('../utils/verify.js'); 

module.exports = async ({ deployments, getNamedAccounts }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    console.log(deployer);
    let ethPriceFeedAddress;

    if(chainId == 31337){
        const ethUsdAggregator = await deployments.get("MockV3Aggregator");
        ethPriceFeedAddress = ethUsdAggregator.address;
    } else {
        ethPriceFeedAddress = networkConfig[chainId]["ethUsdPriceFeed"];
    }

    const args = [ethPriceFeedAddress];

    const charity = await deploy("Charity", {
        contract: "Charity",
        from: deployer,
        log: true,
        args: args,
        waitConfirmation: network.config.blockConfirmations || 1,
    });

    if(
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ){
        verify(charity.address, args);
        log("Verification Success");
    }
    log('-------------------------------------------------------')
}

module.exports.tags = ["all","charity"];