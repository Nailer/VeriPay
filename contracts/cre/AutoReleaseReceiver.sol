// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/// Just the one function this receiver needs to call. autoRelease() already has
/// every real safety check inside VeriPayEscrow itself (window passed, not
/// disputed, not already settled) — this contract doesn't duplicate any of
/// that, it only decides *when* to call it.
interface IVeriPayEscrowAutoRelease {
  function autoRelease(uint256 _id) external;
}

/**
 * @title AutoReleaseReceiver
 * @notice Lets a Chainlink CRE cron workflow trigger VeriPayEscrow's
 *         autoRelease() on a schedule, instead of relying on a human to
 *         remember to call it once a buyer's confirmation window has passed.
 *         Closes a real reliability gap: today, a seller who is owed a
 *         release simply waits forever if nobody happens to call the
 *         function for them.
 *
 * Deliberately holds no funds and has no special permission on the escrow
 * contract — autoRelease() is `external` and callable by anyone already, so
 * this contract just calls it like any other caller would, on a schedule
 * instead of by hand. If VeriPayEscrow ever changed to require a permission
 * this contract doesn't have, that would surface as a normal revert here,
 * caught per-trade (see below), not a security assumption baked into this file.
 */
contract AutoReleaseReceiver is ReceiverTemplate {
  address public immutable escrow;

  event AutoReleaseSucceeded(uint256 indexed tradeId);
  /// Not fatal — the same trade will simply be skipped until the next report
  /// includes it, or it drops off the workflow's due-list because someone
  /// else already settled it in the meantime.
  event AutoReleaseFailed(uint256 indexed tradeId, string reason);

  constructor(address _forwarder, address _escrow) ReceiverTemplate(_forwarder) {
    require(_escrow != address(0), "escrow required");
    escrow = _escrow;
  }

  /// @dev report = abi.encode(uint256[] tradeIds) — the CRE workflow reads
  /// VeriPayEscrow's own trade data, decides which ids are past their
  /// autoReleaseAt and still open, and packs those ids into one report.
  /// A batch can partially fail without reverting the rest: one trade
  /// released manually between the workflow's read and this report landing
  /// on-chain shouldn't block every other due trade in the same batch.
  function _processReport(bytes calldata report) internal override {
    uint256[] memory tradeIds = abi.decode(report, (uint256[]));

    for (uint256 i = 0; i < tradeIds.length; i++) {
      uint256 id = tradeIds[i];
      try IVeriPayEscrowAutoRelease(escrow).autoRelease(id) {
        emit AutoReleaseSucceeded(id);
      } catch Error(string memory reason) {
        emit AutoReleaseFailed(id, reason);
      } catch {
        emit AutoReleaseFailed(id, "unknown");
      }
    }
  }
}
