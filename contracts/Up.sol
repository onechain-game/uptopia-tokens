// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title Up
/// @notice ERC-20 token with a fixed supply of 500,000,000 UP.
contract Up is ERC20, ERC20Permit, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 500_000_000 * 1e18;

    error ZeroReceiver();

    /// @notice Deploys UP and mints the entire fixed supply to `receiver`.
    /// @param receiver Address that receives the full token supply.
    constructor(address receiver) ERC20("Uptopia", "UP") {
        if (receiver == address(0)) revert ZeroReceiver();

        _mint(receiver, TOTAL_SUPPLY);
    }
}
