// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

library PriceConverter{
    function getPrice(AggregatorV3Interface priceFeed)
        internal
        view
        returns(uint256)
    {
        (, int256 answer,,,) = priceFeed.latestRoundData();
        return uint256(answer * 10**10);
    }

    function getConversionRate(uint256 ethAmount, AggregatorV3Interface priceFeed)
        internal
        view
        returns(uint256)
    {
        uint256 ethAmountInUsd = (getPrice(priceFeed) * ethAmount) / 10**18;
        return ethAmountInUsd;
    }
}