// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./PriceConverter.sol";

error Charity__NotOwner();
error Charity__DonationIsClosed();
error Charity__NotEnoughAmountEntered();
error Charity__TransferedFailed();
error Charity__InsufficientFund();
error Charity__DonationNotRefundable();

contract Charity is ReentrancyGuard{
    using PriceConverter for uint256;

    enum DonationState{
        OPEN,
        CLOSED
    }

    enum DonationCategory {
        EDUCATION,
        HEALTHCARE,
        POVERTY,
        DISASTER,
        ENVIRONMENT,
        ANIMAL,
        INFRASTRUCTURE,
        HUMAN_RIGHT,
        EMPOWERMENT
    }

    struct DonationHistory{
        bytes32 donationId;
        address donater;
        uint256 amount;
        string message;
        uint256 timestamp;
    }

    struct Donation {
        bytes32 id;
        address owner;
        address donationTarget;
        string title;
        uint256 priceTarget;
        string description;
        uint256 endTime;
        DonationState state;
        DonationCategory category;
        bool refundable;
        string refundMessage;
        uint256 donationRaised;
        uint256 donationWithdrawed;
        address[] donater;
        string imgUrl;
        mapping (address => DonationHistory[]) donaterToDonateHistory;
        mapping (address => bool) isDonater;
        mapping (address => uint256) donaterToAmount;
    }

    Donation[] private s_donations;
    DonationHistory[] private s_donationHistories;
    mapping(address => uint256[]) private s_ownerToDonations;
    mapping(bytes32 => uint256) private s_idToDonations;
    address[] private s_owner;
    AggregatorV3Interface private immutable i_priceFeed;
    uint256 private constant MINIMUM_DONATION = 10 * 10**18;

    event DonationCreated(bytes32 indexed donationId, address indexed creator, string indexed title, uint256 timestamp);
    event Donate(bytes32 indexed donationId, address indexed donater, uint256 indexed amount, string message, uint256 timestamp);
    event TargetAchieved(bytes32 indexed donationId);
    event DonationEnded(bytes32 indexed donationId, address target, uint256 donationAmount);
    event TimeExtended(bytes32 indexed donationId, uint256 indexed time);
    event Withdrawed(bytes32 indexed donationId, uint256 indexed withdrawAmount);
    event RefundIssued(bytes32 indexed donationId, string indexed message);
    event RefundClaimed(bytes32 indexed donationId, address indexed donater, uint256 amount);

    modifier OnlyOwner(bytes32 donationId){
        if(s_donations[s_idToDonations[donationId]].owner != msg.sender){
            revert Charity__NotOwner();
        }
        _;
    }

    modifier IsOpen(bytes32 donationId){
        Donation storage donation = s_donations[s_idToDonations[donationId]];
        if(s_donations[s_idToDonations[donationId]].state == DonationState.CLOSED || block.timestamp >= donation.endTime){
            revert Charity__DonationIsClosed();
        }
        _;
    }

    constructor(
        address _priceFeedAddress
    ) {
        i_priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    function createDonation(
        string memory _title,
        uint256 _priceTarget,
        uint256 _endTime,
        address _target,
        string memory _description,
        DonationCategory _category,
        string memory _imgUrl
    ) public {
        address _owner = msg.sender;

        s_donations.push();
        uint256 donationIndex = s_donations.length - 1;

        bytes32 donationId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                _title
            )
        );

        Donation storage newDonation = s_donations[donationIndex];
        newDonation.id = donationId;
        newDonation.owner = _owner;
        newDonation.title = _title;
        newDonation.priceTarget = _priceTarget * 10**18;
        newDonation.endTime = _endTime;
        newDonation.description = _description;
        newDonation.state = DonationState.OPEN;
        newDonation.donationTarget = _target;
        newDonation.donationRaised = 0;
        newDonation.donationWithdrawed = 0;
        newDonation.refundable = false;
        newDonation.category = _category;
        newDonation.imgUrl = _imgUrl;

        if(s_ownerToDonations[_owner].length == 0) {
            s_owner.push(_owner);
        }

        s_ownerToDonations[_owner].push(donationIndex);
        s_idToDonations[donationId] = donationIndex;


        emit DonationCreated(donationId, _owner, _title, block.timestamp);
    }

    function donate(bytes32 donationId, string memory _message) public payable IsOpen(donationId) {
        if(msg.value.getConversionRate(i_priceFeed) < MINIMUM_DONATION){
            revert Charity__NotEnoughAmountEntered();
        }

        Donation storage donation = s_donations[s_idToDonations[donationId]];

        if(!donation.isDonater[msg.sender]){
            donation.donater.push(msg.sender);
            donation.isDonater[msg.sender] = true;
        }

        DonationHistory memory donationHistory = DonationHistory(donationId, msg.sender, msg.value, _message, block.timestamp);

        donation.donaterToDonateHistory[msg.sender].push(donationHistory);
        donation.donaterToAmount[msg.sender] += msg.value;
        donation.donationRaised += msg.value;

        s_donationHistories.push(donationHistory);

        emit Donate(donationId, msg.sender, msg.value, _message, block.timestamp);

        if(donation.donationRaised >= donation.priceTarget){
            emit TargetAchieved(donationId);
        }
    }

    function endDonation(bytes32 donationId) public OnlyOwner(donationId) IsOpen(donationId) nonReentrant {
        Donation storage donation = s_donations[s_idToDonations[donationId]];
        donation.state = DonationState.CLOSED;

        address recipient = donation.donationTarget;
        uint256 amountToTransfer = donation.donationRaised;

        if(!donation.refundable){
            (bool isSuccess,) = payable(recipient).call{ value: amountToTransfer  }("");

            if(!isSuccess){
                revert Charity__TransferedFailed();
            }

        } else {
            amountToTransfer = 0;
        }
        emit DonationEnded(donationId, recipient, amountToTransfer);
    }

    function setDonationTime(bytes32 donationId, uint256 _newEndTime) public OnlyOwner(donationId) IsOpen(donationId){
        Donation storage donation = s_donations[s_idToDonations[donationId]];

        donation.endTime = _newEndTime;

        emit TimeExtended(donationId, _newEndTime);
    }

    function issueRefund(bytes32 donationId, string memory _message) public OnlyOwner(donationId) IsOpen(donationId){
        Donation storage donation = s_donations[s_idToDonations[donationId]];

        if(donation.donationWithdrawed != 0 || donation.donationRaised == 0){
            revert Charity__DonationNotRefundable();
        }
        
        donation.refundable = true;
        donation.refundMessage = _message;

        endDonation(donationId);

        emit RefundIssued(donationId, _message);
    }

    function claimRefund(bytes32 donationId, address donater) public nonReentrant {
        Donation storage donation = s_donations[s_idToDonations[donationId]];
        
        if(!donation.refundable){
            revert Charity__DonationNotRefundable();
        }
        
        uint256 refundAmount = donation.donaterToAmount[donater];
        donation.donaterToAmount[donater] = 0;
        donation.donationRaised -= refundAmount;

        (bool isSuccess,) = payable(donater).call{ value: refundAmount }("");

        if(!isSuccess){
            revert Charity__TransferedFailed();
        }


        emit RefundClaimed(donationId, donater, refundAmount);
    }

    function withdraw(bytes32 donationId, uint256 withdrawalAmount) public OnlyOwner(donationId) nonReentrant {
        Donation storage donation = s_donations[s_idToDonations[donationId]];

        uint256 availableBalance = donation.donationRaised - donation.donationWithdrawed;

        if(availableBalance < withdrawalAmount){
            revert Charity__InsufficientFund();
        }

        (bool isSuccess,) = payable(donation.donationTarget).call{ value: withdrawalAmount }("");

        if(!isSuccess){
            revert Charity__TransferedFailed();
        }
        
        donation.donationWithdrawed += withdrawalAmount;

        emit Withdrawed(donationId, withdrawalAmount);
    }

    function getPriceFeed() public view returns(AggregatorV3Interface) {
        return i_priceFeed;
    }

    function getDonationLength() public view returns(uint256){
        return s_donations.length;
    }

    function getDonationDetails(uint256 index) 
        public 
        view 
        returns (
            bytes32 id, 
            address owner, 
            address donationTarget, 
            string memory title, 
            uint256 priceTarget, 
            string memory description, 
            uint256 endTime, 
            DonationState state, 
            DonationCategory category,
            bool refundable, 
            string memory refundMessage, 
            uint256 donationRaised, 
            uint256 donationWithdrawed, 
            address[] memory donater,
            string memory imgUrl
        ) 
    {
        Donation storage donation = s_donations[index];

        return (
            donation.id,
            donation.owner,
            donation.donationTarget,
            donation.title,
            donation.priceTarget,
            donation.description,
            donation.endTime,
            donation.state,
            donation.category,
            donation.refundable,
            donation.refundMessage,
            donation.donationRaised,
            donation.donationWithdrawed,
            donation.donater,
            donation.imgUrl
        );
    }


    function getDonationIndexByOwner(address owner) public view returns(uint256[] memory){
        return s_ownerToDonations[owner];
    }

    function getDonationIndexById(bytes32 donationId) public view  returns(uint256){
        return s_idToDonations[donationId];
    }

    function getOwnerLength() public view returns(uint256){
        return s_owner.length;
    }

    function getOwner(uint256 index) public view returns(address){
        return s_owner[index];
    }

    function getAllDonationHistory() public view returns(DonationHistory[] memory){
        return s_donationHistories;
    }

    function getDonationHistory(bytes32 donationId, address owner) public view returns(DonationHistory[] memory){
        DonationHistory[] memory ownerDonateHistory = s_donations[getDonationIndexById(donationId)].donaterToDonateHistory[owner];
        return ownerDonateHistory;
    }

    function getDonationHistoryLength() public view returns(uint256) {
        return s_donationHistories.length;
    }

    function getDonationAmount(bytes32 donationId, address owner) public view returns(uint256){
        return s_donations[s_idToDonations[donationId]].donaterToAmount[owner];
    }

    function getConvertedEthAmount(uint256 ethAmount) public view returns (uint256) {
        return ethAmount.getConversionRate(i_priceFeed);
    }

    function getEthUsdPrice() public view returns(uint256) {
        return PriceConverter.getPrice(i_priceFeed);
    }
}