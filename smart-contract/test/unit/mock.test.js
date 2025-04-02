const { assert, expect } = require("chai");
const { deployments, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat.config");


!developmentChains.includes(network.name) 
    ?   describe.skip
    :   describe("MockV3Aggregator", () => {
            let mockV3Aggregator, charity;
            beforeEach(async () => {
                const mockV3AggregatorContract = await deployments.get("MockV3Aggregator");
                mockV3Aggregator = await ethers.getContractAt("MockV3Aggregator", mockV3AggregatorContract.address);
            
                const charityContract = await deployments.get("Charity")
                charity = await ethers.getContractAt("Charity", charityContract.address);
            })

            it('should return correct price', async () => {
                const [,price,,,] = await mockV3Aggregator.latestRoundData();
                assert.equal(price, 2000 * 10 ** 8);
            })

            it("Should return the correct ETH to USD conversion", async () => {
                const ethAmount = ethers.parseEther("1"); 
                const convertedAmount = await charity.getConvertedEthAmount(ethAmount);
                assert.equal(convertedAmount, 2000 * 10**18)
            });
        })