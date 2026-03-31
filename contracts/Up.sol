// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Up
/// @notice ERC-20 token with a fixed supply of 500 000 000 UP and built-in
/// immutable step-vesting.
///
/// The entire supply is minted to the contract itself at deployment.
/// All allocation parameters are set once in the constructor and can never be
/// modified.
///
/// Allocations marked `instantRelease` are transferred directly to the
/// beneficiary during construction (for Public Sale & Liquidity Provision).
/// Remaining allocations follow the vesting schedule that begins when
/// `startTGE()` is called by the deployer.
///
/// Vesting formula (per non-instant allocation):
///   - At TGE: `tgeAmount` is immediately claimable.
///   - After TGE + `cliffDuration`: each completed `vestingInterval` unlocks
///     one additional `amountPerInterval`.  The first tranche unlocks at the
///     cliff end.
///   - Total vested is capped at `totalAmount`.
contract Up is ERC20, ReentrancyGuard {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant TOTAL_SUPPLY = 500_000_000 * 1e18;

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

    error EmptyAllocations();
    error ZeroBeneficiary(uint256 index);
    error TGEExceedsTotal(uint256 index);
    error MissingVestingInterval(uint256 index);
    error MissingAmountPerInterval(uint256 index);
    error InstantMustBeFullTGE(uint256 index);
    error TotalAllocatedMismatch(uint256 allocated, uint256 expected);
    error NotBeneficiary();
    error NothingToClaim();
    error TGEAlreadyStarted();
    error TGENotStarted();
    error NotDeployer();

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a beneficiary claims vested tokens.
    /// @param id          Allocation index.
    /// @param beneficiary Recipient address.
    /// @param amount      Tokens transferred.
    event Claimed(uint256 indexed id, address indexed beneficiary, uint256 amount);

    /// @notice Emitted when TGE is activated.
    /// @param timestamp The block.timestamp when TGE was started.
    event TGEStarted(uint256 timestamp);

    // ─── Immutable state ──────────────────────────────────────────────────────

    /// @notice The deployer address — the only account that can call `startTGE`.
    address public immutable deployer;

    /// @notice Number of allocations.
    uint256 public immutable allocationCount;

    /// @notice Sum of all `totalAmount` values across every allocation.
    uint256 public immutable totalAllocated;

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @notice TGE (Token Generation Event) unix timestamp.  Zero until
    /// `startTGE()` is called.
    uint256 public tge;

    mapping(uint256 => Allocation) private _allocations;

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploys UP, mints total supply to itself, registers all vesting
    /// schedules, and immediately transfers instant-release allocations.
    /// @param _params Ordered allocation parameters (one per category).
    constructor(
        AllocationParams[] memory _params
    ) ERC20("Uptopia", "UP") {
        if (_params.length == 0) revert EmptyAllocations();

        deployer = msg.sender;

        uint256 total;
        for (uint256 i = 0; i < _params.length; i++) {
            AllocationParams memory p = _params[i];
            if (p.beneficiary == address(0)) revert ZeroBeneficiary(i);
            if (p.tgeAmount > p.totalAmount) revert TGEExceedsTotal(i);

            if (p.instantRelease) {
                // Instant-release allocations must have tgeAmount == totalAmount
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
                claimed: p.instantRelease ? p.totalAmount : 0,
                instantRelease: p.instantRelease
            });
            total += p.totalAmount;
        }

        if (total != TOTAL_SUPPLY) revert TotalAllocatedMismatch(total, TOTAL_SUPPLY);

        allocationCount = _params.length;
        totalAllocated = total;

        _mint(address(this), TOTAL_SUPPLY);

        // Transfer instant-release allocations
        for (uint256 i = 0; i < _params.length; i++) {
            if (_params[i].instantRelease) {
                _transfer(address(this), _params[i].beneficiary, _params[i].totalAmount);
            }
        }
    }

    // ─── TGE activation ──────────────────────────────────────────────────────

    /// @notice Activates the Token Generation Event.  Can only be called once,
    /// by the deployer.  Sets `tge` to `block.timestamp`.
    function startTGE() external {
        if (msg.sender != deployer) revert NotDeployer();
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

    /// @notice Total vested amount (including already-claimed tokens) at the
    /// current block timestamp.
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
        _transfer(address(this), a.beneficiary, amount);

        emit Claimed(id, a.beneficiary, amount);
    }
}