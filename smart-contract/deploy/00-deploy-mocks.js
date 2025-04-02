const { network } = require("hardhat");
const { DECIMAL, INITIAL_NUMBER } = require("../helper-hardhat.config");


module.exports = async ({ deployments, getNamedAccounts }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    const chainId = network.config.chainId;

    if(chainId == 31337){
        log("Local Network Detected! Deploying Mocks...");

        await deploy("MockV3Aggregator", {
            contract: 'MockV3Aggregator',
            from: deployer,
            log: true,
            args: [DECIMAL, INITIAL_NUMBER]
        });

        log('Mocked Deployed');
        log('-------------------------------------------');
    }
}

module.exports.tags = ['all','mocks']; 