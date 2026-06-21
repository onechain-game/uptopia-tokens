// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TokenDistributor
/// @notice Reusable ERC-20 token distributor with immutable step-vesting schedules.
///
/// The distributor does not mint tokens and does not pull tokens from users.
/// Fund it by transferring enough of `token` to this contract before claims.
/// Instant-release allocations can be claimed immediately. Vesting allocations
/// start when `startTGE()` is called by the admin.
contract TokenDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    /// @notice Input parameters for a single allocation (constructor only).
    struct AllocationParams {
        address beneficiary;
        uint256 totalAmount;
        uint256 tgeAmount;
        uint256 cliffDuration;
        uint256 vestingInterval;
        uint256 amountPerInterval;
        bool instantRelease;
    }

    /// @notice On-chain state of a single allocation.
    struct Allocation {
        address beneficiary;
        uint256 totalAmount;
        uint256 tgeAmount;
        uint256 cliffDuration;
        uint256 vestingInterval;
        uint256 amountPerInterval;
        uint256 claimed;
        bool instantRelease;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroToken();
    error EmptyAllocations();
    error ZeroBeneficiary(uint256 index);
    error TGEExceedsTotal(uint256 index);
    error MissingVestingInterval(uint256 index);
    error MissingAmountPerInterval(uint256 index);
    error InstantMustBeFullTGE(uint256 index);
    error NotBeneficiary();
    error NothingToClaim();
    error TGEAlreadyStarted();
    error NotAdmin();

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a beneficiary claims vested tokens.
    /// @param id Allocation index.
    /// @param beneficiary Recipient address.
    /// @param amount Tokens transferred.
    event Claimed(uint256 indexed id, address indexed beneficiary, uint256 amount);

    /// @notice Emitted when TGE is activated.
    /// @param timestamp The block.timestamp when TGE was started.
    event TGEStarted(uint256 timestamp);

    // ─── Immutable state ──────────────────────────────────────────────────────

    /// @notice ERC-20 token distributed by this contract.
    IERC20 public immutable token;

    /// @notice Account allowed to call `startTGE`.
    address public immutable admin;

    /// @notice Number of allocations.
    uint256 public immutable allocationCount;

    /// @notice Sum of all `totalAmount` values across every allocation.
    uint256 public immutable totalAllocated;

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice TGE (Token Generation Event) unix timestamp. Zero until started.
    uint256 public tge;

    mapping(uint256 => Allocation) private _allocations;

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Registers immutable distribution schedules for `token`.
    /// @param token_ ERC-20 token to distribute.
    /// @param params Ordered allocation parameters.
    constructor(IERC20 token_, AllocationParams[] memory params) {
        if (address(token_) == address(0)) revert ZeroToken();
        if (params.length == 0) revert EmptyAllocations();

        token = token_;
        admin = msg.sender;

        uint256 total;
        for (uint256 i = 0; i < params.length; i++) {
            AllocationParams memory p = params[i];
            if (p.beneficiary == address(0)) revert ZeroBeneficiary(i);
            if (p.tgeAmount > p.totalAmount) revert TGEExceedsTotal(i);

            if (p.instantRelease) {
                if (p.tgeAmount != p.totalAmount) revert InstantMustBeFullTGE(i);
            } else if (p.totalAmount > p.tgeAmount) {
                if (p.vestingInterval == 0) revert MissingVestingInterval(i);
                if (p.amountPerInterval == 0) revert MissingAmountPerInterval(i);
            }

            _allocations[i] = Allocation({
                beneficiary: p.beneficiary,
                totalAmount: p.totalAmount,
                tgeAmount: p.tgeAmount,
                cliffDuration: p.cliffDuration,
                vestingInterval: p.vestingInterval,
                amountPerInterval: p.amountPerInterval,
                claimed: 0,
                instantRelease: p.instantRelease
            });
            total += p.totalAmount;
        }

        allocationCount = params.length;
        totalAllocated = total;
    }

    // ─── TGE activation ──────────────────────────────────────────────────────

    /// @notice Activates the Token Generation Event. Can only be called once by admin.
    function startTGE() external {
        if (msg.sender != admin) revert NotAdmin();
        if (tge != 0) revert TGEAlreadyStarted();

        tge = block.timestamp;
        emit TGEStarted(block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Returns the full allocation state for the given id.
    /// @param id Allocation index (0-based).
    function getAllocation(uint256 id) external view returns (Allocation memory) {
        return _allocations[id];
    }

    /// @notice Total vested amount, including claimed tokens, at current timestamp.
    /// @param id Allocation index.
    /// @return Total vested amount capped at `totalAmount`.
    function vested(uint256 id) public view returns (uint256) {
        Allocation storage a = _allocations[id];
        if (a.totalAmount == 0) return 0;
        if (a.instantRelease) return a.totalAmount;
        if (tge == 0 || block.timestamp < tge) return 0;

        uint256 amount = a.tgeAmount;

        if (a.vestingInterval > 0) {
            uint256 cliffEnd = tge + a.cliffDuration;
            if (block.timestamp >= cliffEnd) {
                uint256 periods = ((block.timestamp - cliffEnd) / a.vestingInterval) + 1;
                amount += periods * a.amountPerInterval;
            }
        }

        return amount > a.totalAmount ? a.totalAmount : amount;
    }

    /// @notice Tokens currently claimable by the beneficiary.
    /// @param id Allocation index.
    function claimable(uint256 id) public view returns (uint256) {
        uint256 v = vested(id);
        uint256 c = _allocations[id].claimed;
        return v > c ? v - c : 0;
    }

    // ─── Mutations ────────────────────────────────────────────────────────────

    /// @notice Claims all unlocked and unclaimed tokens for an allocation.
    /// @dev Only the allocation's beneficiary may call this function.
    /// @param id Allocation index.
    function claim(uint256 id) external nonReentrant {
        Allocation storage a = _allocations[id];
        if (msg.sender != a.beneficiary) revert NotBeneficiary();

        uint256 amount = claimable(id);
        if (amount == 0) revert NothingToClaim();

        a.claimed += amount;
        token.safeTransfer(a.beneficiary, amount);

        emit Claimed(id, a.beneficiary, amount);
    }
}
