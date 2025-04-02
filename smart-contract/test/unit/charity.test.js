const { formatBytes32String } = require("ethers");
const { deployments, getNamedAccounts, network } = require('hardhat');
const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { developmentChains } = require("../../helper-hardhat.config");

!developmentChains.includes(network.name) 
    ?   describe.skip
    :   describe('Charity', async () => {
            let unconnectedCharity, charity, mockV3Aggregator, deployer, owner, donater;
            beforeEach(async () => {
                const account = await getNamedAccounts();
                donater = await ethers.getSigner(account.donater);
                owner = await ethers.getSigner(account.owner);
                await deployments.fixture(["all"]);

                const mockV3AggregatorContract = await deployments.get("MockV3Aggregator");
                const charityContract = await deployments.get("Charity");

                mockV3Aggregator = await ethers.getContractAt("MockV3Aggregator",mockV3AggregatorContract.address);
                unconnectedCharity = await ethers.getContractAt("Charity",charityContract.address);
                charity = unconnectedCharity.connect(owner);
            });

            describe("constructor", () => {
                it('set the aggregator correctly', async () => {
                    const response = await charity.getPriceFeed().address;
                    assert.equal(response, mockV3Aggregator.address);
                })
            })

            describe("Function", () => {
                let title, priceTarget, endTime, target, description, donationId, imgUrl;
                beforeEach(async () => {
                    title = "Donation for Strave Kids";
                    priceTarget = 5;
                    endTime = 1775097600;
                    target = donater.address;
                    description = "Donasi untuk anak-anak lapar di Afrika";
                    category = 1;
                    imgUrl = "http://test.png"

                    await charity.createDonation(title, priceTarget, endTime, target, description, category, imgUrl);
                })

                describe("createDonation", async () => {
                    it('store all information correcly', async () => {
                        const [
                            id, 
                            donationOwner, 
                            donationTarget, 
                            donationTitle, 
                            donationpPriceTarget, 
                            donationDescription,
                            donationEndTime,
                            donationState,
                            donationCategory,
                            donationRefundable,
                            donationRefundMessage,
                            donationDonationRaised,
                            donationDonationWithdrawed,
                            donationDonater,
                            donationImgUrl
                        ] = await charity.getDonationDetails(0);
                        donationId = id;

                        const donationLength = await charity.getDonationLength();
                        const donationIndexByOwner = await charity.getDonationIndexByOwner(owner.address);
                        const donationIndexById = await charity.getDonationIndexById(donationId);
                        const ownerLength = await charity.getOwnerLength();

                        assert.equal(donationLength, 1);
            
                        assert.equal(donationOwner, owner.address);
                        assert.equal(donationTarget, target);
                        assert.equal(donationTitle, title);
                        assert.equal(donationpPriceTarget, priceTarget * 10**18);
                        assert.equal(donationDescription, description);
                        assert.equal(donationEndTime, endTime);
                        assert.equal(donationImgUrl, imgUrl);
                        assert.equal(donationState, 0);
                        assert.isFalse(donationRefundable);
                        assert.equal(donationRefundMessage, "");
                        assert.equal(donationDonationRaised, 0);
                        assert.equal(donationDonationWithdrawed, 0);
                        assert.equal(donationDonater.length, 0);
                        assert.equal(donationCategory, 1);

                        assert.equal(donationIndexByOwner.length, 1);
                        assert.equal(donationIndexById, 0);
                        assert.equal(ownerLength, 1);
                    })
                })

                describe("donate", async() => {
                    let message = "Semangat kakak";
                    it('should be revert if the ETH funded below the minimum donation', async() => {
                        await expect(charity.donate(donationId, message ,{value: 0})).to.be.revertedWithCustomError(
                            charity,
                            "Charity__NotEnoughAmountEntered"
                        );
                    })

                    it('should accept a valid donation and update state correctly', async () => {
                        const donationAmount = ethers.parseEther("0.1");
                        await charity.donate(donationId, message, { value: donationAmount });

                        const [
                            ,,,,,,,,,,,
                            donationDonationRaised
                            ,,
                            donationDonater,
                        ] = await charity.getDonationDetails(0);

                        const donationHistory = await charity.getDonationHistory(donationId, owner.address);
                        const donationAmountRecorded = await charity.getDonationAmount(donationId, owner.address);

                        assert.equal(donationDonationRaised, donationAmount);
                        assert.equal(donationDonater.length, 1);
                        assert.equal(donationAmountRecorded, donationAmount);
                        assert.equal(donationHistory.length, 1);
                        assert.equal(donationHistory[0].donationId, donationId);
                        assert.equal(donationHistory[0].donater, owner.address);
                        assert.equal(donationHistory[0].amount, donationAmount);
                        assert.equal(donationHistory[0].message, message);
                    })

                    it("shouldn't add donater address if the donater alr donate before", async () => {
                        const donationAmount = ethers.parseEther("0.1");
                        await charity.donate(donationId, message, { value: donationAmount });
                        await charity.donate(donationId, message, { value: donationAmount });

                        const [
                            ,,,,,,,,,,,,,
                            donationDonater,
                        ] = await charity.getDonationDetails(0);

                        const donaterLength = donationDonater.length;

                        assert.equal(donaterLength,1);
                    })

                    it('should emit an event when the donate is successfully executed', async () => {
                        const donationAmount = ethers.parseEther("0.1");
                        await expect(charity.donate(donationId, message, { value: donationAmount }))
                            .to.emit(charity, "Donate");
                    })

                    it('should emit an event when the donation target achieved', async () => {
                        const donationAmount = ethers.parseEther("10");
                        await expect(charity.donate(donationId, message, { value: donationAmount }))
                            .to.emit(charity, "TargetAchieved")
                            .withArgs(donationId);
                    })

                    it('should be revert if the donation already closed', async () => {

                        await charity.endDonation(donationId);

                        const donationAmount = ethers.parseEther("0.1");
                        await expect(charity.donate(donationId, message, { value: donationAmount }))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should be reverted if the donation pass the end time', async () => {
                        const currBlock = await ethers.provider.getBlock('latest');
                        const currTimestamp = currBlock.timestamp;

                        const timeDiff = endTime - currTimestamp;

                        if(timeDiff > 0){
                            await network.provider.send("evm_increaseTime",[timeDiff]);
                            await network.provider.send("evm_mine");
                        }
                        
                        const donationAmount = ethers.parseEther("0.1");
                        await expect(charity.donate(donationId, message, { value: donationAmount }))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })
                })

                describe("endDonation", async () => {
                    beforeEach(async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "Semangat Kakak", { value: donationAmount })
                    })

                    it('should be reverted when accessed by other wallet', async () => {
                        const donaterCharity = await unconnectedCharity.connect(donater);

                        await expect(donaterCharity.endDonation(donationId))
                            .to.be.revertedWithCustomError(charity, "Charity__NotOwner");
                    })

                    it('should be reverted if called after the donation is closed', async () => {
                        await charity.endDonation(donationId);

                        await expect(charity.endDonation(donationId))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should update all state correctly', async () => {
                        const targetInitialBalance = await ethers.provider.getBalance(target);
                        await charity.endDonation(donationId);
                        
                        const [
                            ,,,,,,,
                            donationState,
                            ,,,
                            donationDonationRaised,
                            ,,
                            
                        ] = await charity.getDonationDetails(0);

                        const targetCurrentBalance = await ethers.provider.getBalance(target);
                        const expectedTargetBalance = targetInitialBalance + donationDonationRaised;

                        assert.equal(donationState, 1);
                        assert.equal(targetCurrentBalance, expectedTargetBalance);
                    })

                    it('should emit an event after donation is ended', async () => {
                        await expect(charity.endDonation(donationId))
                            .to.emit(charity, "DonationEnded")
                            .withArgs(donationId, target, ethers.parseEther("1"));
                    })
                })

                describe('setDonationTime', async () => {
                    let newEndTime = 1942428800;
                    it('should be reverted when accessed by other wallet', async () => {
                        const donaterCharity = await unconnectedCharity.connect(donater);

                        await expect(donaterCharity.setDonationTime(donationId, newEndTime))
                            .to.be.revertedWithCustomError(charity, "Charity__NotOwner");
                    })

                    it('should be reverted when the donation already closed', async () => {
                        const newEndTime = 1942428800;
                        await charity.endDonation(donationId);

                        await expect(charity.setDonationTime(donationId, newEndTime))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should be reverted if the donation pass the end time', async () => {
                        const currBlock = await ethers.provider.getBlock('latest');
                        const currTimestamp = currBlock.timestamp;

                        const timeDiff = endTime - currTimestamp;

                        if(timeDiff > 0){
                            await network.provider.send("evm_increaseTime",[timeDiff]);
                            await network.provider.send("evm_mine");
                        }

                        await expect(charity.setDonationTime(donationId, newEndTime))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should update the donation end time', async () => {
                        await charity.setDonationTime(donationId, newEndTime);

                        const [
                            ,,,,,,
                            donationEndTime,
                            ,,,,,,,
                            
                        ] = await charity.getDonationDetails(0);

                        assert.equal(donationEndTime, newEndTime);
                    })

                    it('should emit an event', async () => {
                        await expect(charity.setDonationTime(donationId, newEndTime))
                            .to.emit(charity, "TimeExtended")
                            .withArgs(donationId, newEndTime);
                    })
                })

                describe("issueRefund", () => {
                    let message ="Ternyata orangnya skem";

                    it('should be reverted when there is no fund yet', async () => {
                        await expect(charity.issueRefund(donationId, message))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationNotRefundable");
                    })

                    it('should be reverted when accessed by other wallet', async () => {
                        const donaterCharity = await unconnectedCharity.connect(donater);

                        await expect(donaterCharity.issueRefund(donationId, message))
                            .to.be.revertedWithCustomError(charity, "Charity__NotOwner");
                    })

                    it('should be reverted when the donation already closed', async () => {
                        await charity.endDonation(donationId);

                        await expect(charity.issueRefund(donationId, message))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should be reverted if the donation pass the end time', async () => {
                        const currBlock = await ethers.provider.getBlock('latest');
                        const currTimestamp = currBlock.timestamp;

                        const timeDiff = endTime - currTimestamp;

                        if(timeDiff > 0){
                            await network.provider.send("evm_increaseTime",[timeDiff]);
                            await network.provider.send("evm_mine");
                        }

                        await expect(charity.issueRefund(donationId, message))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationIsClosed");
                    })

                    it('should update all state correctly', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "Semangat Kakak", { value: donationAmount })

                        await charity.issueRefund(donationId, message);

                        const [
                            ,,,,,,,,,
                            donationRefundable,
                            donationRefundMessage,
                            ,,,
                        ] = await charity.getDonationDetails(0);

                        assert.isTrue(donationRefundable);
                        assert.equal(donationRefundMessage, message);
                    })

                    it('should emit event when called successfully', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "Semangat Kakak", { value: donationAmount })

                        await expect(charity.issueRefund(donationId, message))
                            .to.emit(charity, "RefundIssued")
                            .withArgs(donationId, message);
                    })
                })

                describe('claimRefund', () => {
                    let refundMessage ="Ternyata orangnya skem";

                    it('should be reverted if the donation is not refundable', async () => {
                        await expect(charity.claimRefund(donationId, owner.address))
                            .to.be.revertedWithCustomError(charity, "Charity__DonationNotRefundable");
                    })

                    it('should update all the state correctly and transfer to the donater', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "Semangat Kak", { value: donationAmount })
                        await charity.issueRefund(donationId, refundMessage);

                        const currBlock = await ethers.provider.getBlock('latest');
                        const currTimestamp = currBlock.timestamp;

                        const timeDiff = endTime - currTimestamp;

                        if(timeDiff > 0){
                            await network.provider.send("evm_increaseTime",[timeDiff]);
                            await network.provider.send("evm_mine");
                        }

                        const [
                            ,,,,,,,,,,,
                            donationRaisedBefore,
                            donationWithdrawedBefore,,
                        ] = await charity.getDonationDetails(0);

                        const ownerDonationAmountBefore = await charity.getDonationAmount(donationId, owner.address);
                        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
                        
                        const tx = await charity.claimRefund(donationId, owner.address);
                        const receipt = await tx.wait(); 
                        const gasUsed = receipt.gasUsed; 
                        const gasPrice = tx.gasPrice; 

                        const gasCost = gasUsed * gasPrice;

                        const [
                            ,,,,,,,,,,,
                            donationRaisedAfter,
                            donationWithdrawedAfter,,
                        ] = await charity.getDonationDetails(0);

                        const ownerDonationAmountAfter = await charity.getDonationAmount(donationId, owner.address);
                        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

                        assert.equal(BigInt(donationRaisedBefore) - BigInt(ownerDonationAmountBefore), BigInt(donationRaisedAfter));
                        assert.equal(ownerDonationAmountAfter, 0);
                        assert.equal(BigInt(ownerBalanceBefore) + BigInt(ownerDonationAmountBefore) - BigInt(gasCost), BigInt(ownerBalanceAfter));
                    })

                    it('should emit event if the claim success', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "Semangat Kak", { value: donationAmount })
                        await charity.issueRefund(donationId, refundMessage);

                        const currBlock = await ethers.provider.getBlock('latest');
                        const currTimestamp = currBlock.timestamp;

                        const timeDiff = endTime - currTimestamp;

                        if(timeDiff > 0){
                            await network.provider.send("evm_increaseTime",[timeDiff]);
                            await network.provider.send("evm_mine");
                        }

                        const ownerDonateAmount = await charity.getDonationAmount(donationId, owner.address);

                        await expect(charity.claimRefund(donationId, owner.address))
                            .to.emit(charity, "RefundClaimed")
                            .withArgs(donationId, owner.address, ownerDonateAmount);

                        
                    })
                })

                describe('withdraw', () => {
                    let withdrawalAmount = ethers.parseEther("1");

                    it('should be reverted if there is no fund raised yet', async () => {
                        await expect(charity.withdraw(donationId, withdrawalAmount))
                            .to.be.revertedWithCustomError(charity, "Charity__InsufficientFund");
                    })

                    it('should update all state correctly and transfer to the target', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "semangat kak", { value: donationAmount });

                        const [
                            ,,
                            donationTarget,
                            ,,,,,,,,
                            donationRaised,
                            donationWithdrawedBefore,,
                        ] = await charity.getDonationDetails(0);

                        const targetBalanceBefore = await ethers.provider.getBalance(donationTarget);


                        const tx = await charity.withdraw(donationId, donationAmount);
                        const receipt = await tx.wait(1);
                        const gasUsed = receipt.gasUsed;
                        const gasPrice = tx.gasPrice; 
                        const gasCost = gasPrice * gasUsed;

                        const [
                            ,,,,,,,,,,,,
                            donationWithdrawedAfter,,
                        ] = await charity.getDonationDetails(0);

                        const targetBalanceAfter = await ethers.provider.getBalance(donationTarget);


                        assert.equal(BigInt(targetBalanceBefore) + BigInt(donationAmount), BigInt(targetBalanceAfter));
                        assert.equal(BigInt(donationWithdrawedBefore) + BigInt(donationAmount), BigInt(donationWithdrawedAfter));
                    })

                    it('should emit an event if the withdraw success', async () => {
                        const donationAmount = ethers.parseEther("1");
                        await charity.donate(donationId, "semangat kak", { value: donationAmount });

                        await expect(charity.withdraw(donationId, donationAmount))
                            .to.emit(charity, "Withdrawed")
                            .withArgs(donationId, donationAmount)
                    })
                })
            })
        });