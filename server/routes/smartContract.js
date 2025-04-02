const express = require("express");
const { ethers } = require("ethers")
const cors = require("cors");
const multer = require('multer');
const pinataSDK = require('@pinata/sdk');
const streamifier = require('streamifier');
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const router = express.Router();

( async () => {

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL)
    const contractABI = require("../contractABI.json");
    const contractAddress = process.env.CONTRACT_ADDRESS;

    const privateKey = process.env.PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);

    const pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);

    const storage = multer.memoryStorage();
    const upload = multer({ storage: storage });

    let account;

    router.post('/connectWallet', async (req, res) => {
        const { account: wallet } = req.body;
        try {
            account = wallet;
            res.status(200);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: "Error fetching data" });
        } 
    })
    
    router.get('/getDonation', async (req, res) => {
        try {
            const donationLength = parseInt(await contract.getDonationLength());
    
            const categoryMap = [
                "Education", "Healthcare", "Poverty", "Disaster", "Environment",
                "Animal", "Infrastructure", "Human Right", "Empowerment"
            ];
    
            const currDonations = await Promise.all(
                Array.from({ length: donationLength }, async (_, i) => {
                    try {
                        const [
                            id, 
                            donationOwner, 
                            donationTarget, 
                            donationTitle, 
                            donationPriceTarget, 
                            donationDescription,
                            donationEndTime,
                            donationState,
                            donationCategory,
                            donationRefundable,
                            donationRefundMessage,
                            donationRaised,
                            donationWithdrawed,
                            donationDonater,
                            donationImgUrl
                        ] = await contract.getDonationDetails(i);
    
                        const donationCategory_string = categoryMap[donationCategory] || "Unknown";
    
                        return {
                            id: id,
                            owner: donationOwner,
                            donationTarget: donationTarget,
                            title: donationTitle,
                            priceTarget: ethers.formatEther(donationPriceTarget), 
                            description: donationDescription,
                            endTime: donationEndTime.toString(), 
                            state: donationState.toString(),
                            category: donationCategory_string,
                            refundable: donationRefundable,
                            refundMessage: donationRefundMessage,
                            raised: ethers.formatEther(donationRaised), 
                            withdrawed: ethers.formatEther(donationWithdrawed),
                            donater: donationDonater,
                            imgUrl: donationImgUrl
                        };
                    } catch (e) {
                        console.error(`Error fetching details for donation ID ${i}:`, e);
                        return { id: i, error: "Failed to fetch details" };
                    }
                })
            );

            donations = currDonations;
            res.status(200).json(currDonations);
        } catch (e) {
            console.error("Error fetching donations:", e);
            res.status(500).json({ error: "Failed to fetch donations" });
        }
    });
    

    router.get('/getDonation/:id', async (req, res) => {
        const { id: donationId } = req.params;
        
        try {
            const donation = await getDonationDetail(donationId);

            if(!donation){
                res.status(404).json({ error: "Donation Not Found!" });
            }

            const ownerDonation = await contract.getDonationIndexByOwner(donation.owner) || [];
            donation["ownerTotalCampaign"] = ownerDonation.length;

            const donationHistories = await contract.getAllDonationHistory();

            const fixedDonationHistories = [];

            for(d of donationHistories){
                
                if(d[0] == donation.id){
                    const date = new Date(Number(d[4]) * 1000);
                    const formatedDate = date.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                    });
    
                    fixedDonationHistories.push({
                        donationId: d[0],
                        donater: d[1],
                        amount: ethers.formatEther(d[2]),
                        message: d[3],
                        date: formatedDate.toString()
                    })
                }
            }

            donation["donationHistories"] = fixedDonationHistories;
            
            res.status(200).json(donation);
        } catch(e) {
            console.error("Error fetching donations: ", e);
            res.status(500).json({ error: "Failed to fetch donation" })
        }
        
    })
    
    router.post("/addDonation", upload.single('image'), async(req, res) => {
        try {
            const { title, priceTarget, endTime, donationTarget, description, category } = req.body;
            console.log(req.body);
            if (!title || !priceTarget || !endTime || !donationTarget || !description || !category || !req.file) {
                return res.status(400).json({ error: "All fields are required" });
            }

            const endTimeTimestamp = Math.floor(new Date(endTime).getTime() / 1000);

            const fileBuffer = req.file.buffer;
            const fileName = req.file.originalname;

            const options = {
                pinataMetadata: {
                    name: fileName,
                },
            };

            const fileStream = streamifier.createReadStream(fileBuffer);

            const result = await pinata.pinFileToIPFS(fileStream, options);
            const imgUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
            console.log(imgUrl);

            const tx = await contract.createDonation(title, priceTarget, endTimeTimestamp, donationTarget, description, category, imgUrl);
            await tx.wait();
    
            res.status(200).json({ 
                txHash: tx.hash, 
                message: "Donation created successfully!" 
            });
    
        } catch(e){
            console.error("Error fetching data:", e);
            res.status(500).json({ error: "Failed to Add Donation" });
        }
    })
    
    router.post("/donate/:id", async(req, res) => {
        try {
            const { id: donationId } = req.params;
            const { donationAmount, message } = req.body;
    
            if (!donationAmount || isNaN(donationAmount) || Number(donationAmount) <= 0) {
                return res.status(400).json({ error: "Invalid donation amount." });
            }
            
            const tx = await contract.donate(donationId, message, {
                value: ethers.parseEther(donationAmount.toString())
            });
    
            await listenerForTransactionMine(tx, provider);
    
            res.status(200).json({
                txHash: tx.hash,
                message: "Donation successfully sent"
            })
        } catch(e) {
            console.error("Error fetching data:", e);
    
            if (e.code === "INSUFFICIENT_FUNDS") {
                return res.status(400).json({ error: "Insufficient funds for this donation." });
            }
    
            res.status(500).json({ error: "Failed to Donate" });
        }
    });

    router.get("/getEthToUsd", async (req, res) => {
        try {
            const ethToUsdRate = await contract.getEthUsdPrice();
            const ethUsd_string = ethToUsdRate.toString()
            res.status(200).json(ethUsd_string);
        } catch (e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to get ETH to USD Rate" });
        }
    });

    router.get("/getDonationHistory", async (req, res) => {
        try {
            const donationHistories = await contract.getAllDonationHistory()

            const myDonationHistory = donationHistories.filter((dh) => dh.donater === account);
            
            const fixedHistories = [];
            for(let d of myDonationHistory){
                const donation = await getDonationDetail(d[0]);

                const date = new Date(Number(d[4]) * 1000);
                const formatedDate = date.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                });

                const donationAmount = await contract.getDonationAmount(donation.id ,d[1]);
                const refundClaimed = Number(donationAmount) === 0;
                fixedHistories.push({
                    id: donation.id,
                    title: donation.title,
                    category: donation.category,
                    refundable: donation.refundable,
                    donater: d[1],
                    amount: ethers.formatEther(d[2]),
                    message: d[3],
                    date: formatedDate.toString(),
                    refundClaimed: refundClaimed,
                });
            }
            console.log(fixedHistories, account);
            res.status(200).json(fixedHistories);
        } catch(e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to fetching your donate history" });
        }
    })

    router.get("/getMyDonations", async (req, res) => {
        try {
            if(!account){
                return;
            }
            const myDonationIndex = await contract.getDonationIndexByOwner(account);

            const categoryMap = [
                "Education", "Healthcare", "Poverty", "Disaster", "Environment",
                "Animal", "Infrastructure", "Human Right", "Empowerment"
            ];
            
            const myDonations = await Promise.all(
                Array.from({ length: myDonationIndex.length }, async (_,i) => {
                    try {
                        const [
                            id, 
                            donationOwner, 
                            donationTarget, 
                            donationTitle, 
                            donationPriceTarget, 
                            donationDescription,
                            donationEndTime,
                            donationState,
                            donationCategory,
                            donationRefundable,
                            donationRefundMessage,
                            donationRaised,
                            donationWithdrawed,
                            donationDonater,
                            donationImgUrl
                        ] = await contract.getDonationDetails(myDonationIndex[i]);
    
                        const donationCategory_string = categoryMap[donationCategory] || "Unknown";
                        
                        const donation =  {
                            id: id,
                            owner: donationOwner,
                            donationTarget: donationTarget,
                            title: donationTitle,
                            priceTarget: ethers.formatEther(donationPriceTarget), 
                            description: donationDescription,
                            endTime: donationEndTime.toString(), 
                            state: donationState.toString(),
                            category: donationCategory_string,
                            refundable: donationRefundable,
                            refundMessage: donationRefundMessage,
                            raised: ethers.formatEther(donationRaised), 
                            withdrawed: ethers.formatEther(donationWithdrawed),
                            donater: donationDonater,
                            url: donationImgUrl
                        };
                        return donation;
                    } catch(e) {
                        console.error(e);
                    }
                })
            )

            res.status(200).json(myDonations);
        } catch(e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to fetching your donation post" });
        }
    })

    router.post("/endDonation/:id", async (req, res) => {
        try {
            const { id: donationId } = req.params;

            const tx = await contract.endDonation(donationId, { gasLimit: 1000000 });
            await tx.wait();
            res.status(200).json({ message: "Donation ended successfully!" });
        } catch(e) {
            const errorInfo = contract.interface.parseError(e.data);
            console.log("Decoded Error:", errorInfo);
            res.status(500).json({ error: "Failed to end donation" });
        }
    })

    router.post("/refund/:id", async (req, res) => {
        try {
            const { id: donationId } = req.params;
            const { message } = req.body;
        
            await contract.issueRefund(donationId, message);
            res.status(200).json({ message: "Donation refund successfully!" });
        } catch(e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to refund donation" });
        }
    })

    router.post("/withdraw/:id", async (req, res) => {
        try {
            const { id: donationId } = req.params;
            const { amount } = req.body;
            const amountInWei = ethers.parseEther(amount.toString());
            // console.log(amountInWei);
            const tx = await contract.withdraw(donationId, amountInWei, { gasLimit: 1000000 });
            await tx.wait();

            res.status(200).json({ message: "Donation withdrawed successfully!" });
        } catch(e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to withdrawthe donation" });
        }
    })

    router.post("/claimRefund/:id", async (req, res) => {
        try {
            if(!account){
                return;
            }

            const { id: donationId } = req.params;
            const tx = await contract.claimRefund(donationId, account);

            res.status(200).json({ message: "Refund successfully collected!" });
        } catch(e) {
            console.error("Error fetching data: ", e);
            res.status(500).json({ error: "Failed to claim your refund" });
        }
    })
    
    const listenerForTransactionMine = async (tx, provider) => {
        console.log("Waiting for transaction to be mined...");
        const receipt = await provider.waitForTransaction(tx.hash);
    
        if (receipt.status === 1) {
            console.log("Transaction mined successfully:", receipt.transactionHash);
        } else {
            console.error("Transaction failed:", receipt.transactionHash);
            throw new Error("Transaction failed");
        }
    };

    const getDonationDetail = async (donationId) => {
        const donationIndex = await contract.getDonationIndexById(donationId);
        const [
            id, 
            donationOwner, 
            donationTarget, 
            donationTitle, 
            donationPriceTarget, 
            donationDescription,
            donationEndTime,
            donationState,
            donationCategory,
            donationRefundable,
            donationRefundMessage,
            donationRaised,
            donationWithdrawed,
            donationDonater,
            donationImgUrl
        ] = await contract.getDonationDetails(donationIndex);
    
        const categoryMap = [
            "Education", "Healthcare", "Poverty", "Disaster", "Environment",
            "Animal", "Infrastructure", "Human Right", "Empowerment"
        ];
        
        const donationCategory_string = categoryMap[donationCategory] || "Unknown";
    
        const donation = {
            id: id,
            owner: donationOwner,
            donationTarget: donationTarget,
            title: donationTitle,
            priceTarget: ethers.formatEther(donationPriceTarget), 
            description: donationDescription,
            endTime: donationEndTime.toString(), 
            state: donationState.toString(),
            category: donationCategory_string,
            refundable: donationRefundable,
            refundMessage: donationRefundMessage,
            raised: ethers.formatEther(donationRaised), 
            withdrawed: ethers.formatEther(donationWithdrawed),
            donater: donationDonater,
            imgUrl: donationImgUrl
        };
    
        return donation;
    }
})();




module.exports = router;
