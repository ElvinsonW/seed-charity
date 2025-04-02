
const { assert, expect } = require("chai");
const { developmentChains, networkConfig } = require("../../helper-hardhat.config");
const { network, getNamedAccounts, ethers } = require("hardhat");

developmentChains.includes(network.name) 
    ?   describe.skip
    :   describe("Charity", () => {
            let unconnectedCharity, charity, deployer, donater;
            beforeEach(async () => {
                const accounts = await getNamedAccounts();
                const charityContract = await deployments.get("Charity")
                charity = await ethers.getContractAt("Charity", charityContract.address);
                donater = await ethers.getSigner(accounts.donater);
            })

            describe("constructor", () => {
                it('set the aggregator correctly', async () => {
                    const chainId = network.config.chainId;
                    const response = await charity.getPriceFeed();
                    
                    assert.equal(response, networkConfig[chainId]["ethUsdPriceFeed"]);
                })
            })
            
            it("Should return the current ETH/USD price", async () => {
                const ethUsdPrice = await charity.getEthUsdPrice();
                console.log("ETH/USD Price:", ethers.formatUnits(ethUsdPrice, 18));
                assert(ethUsdPrice > 0, "Price should be greater than 0");
            });
        
            it("Should convert ETH to USD correctly", async () => {
                const ethAmount = ethers.parseEther("1");
                const convertedUsd = await charity.getConvertedEthAmount(ethAmount);
                console.log("1 ETH in USD:", ethers.formatUnits(convertedUsd, 18));
                assert(convertedUsd > 0, "Converted USD value should be greater than 0");
            });
        })