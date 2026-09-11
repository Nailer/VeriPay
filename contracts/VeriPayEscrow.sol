// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  VeriPayEscrow
 * @notice Holds a buyer's payment until the goods or service are delivered.
 *
 * What changed from the first version
 * ----------------------------------
 * The original contract could only end a trade if the two parties agreed:
 * the buyer released, or the seller approved a refund. If they disagreed, the
 * money sat in the contract forever and nobody — not even us — could move it.
 * It also took no fee, so the core product earned nothing.
 *
 * This version adds the things an escrow actually needs:
 *
 *   1. A way out of a deadlock.
 *      Either party can raise a dispute. An arbitrator can then split the
 *      funds any way between them. And if a buyer simply disappears without
 *      confirming or disputing, the seller isn't held hostage — after a
 *      timeout anyone can trigger the release.
 *
 *   2. A fee, charged only when a trade succeeds.
 *      Refunds are always returned in full. We are paid when the trade works,
 *      never when it fails. The rate is fixed at the moment a trade is created,
 *      so changing the fee later can never affect money already locked.
 *
 *   3. Escrow in an ERC-20 token, not just native MON.
 *      A trade can lock a stablecoin (e.g. Agora's AUSD) instead of MON. This
 *      matters specifically because Monad's near-zero fees are what make it
 *      viable to escrow ordinary-sized P2P trades at all — and a dollar-pegged
 *      token removes the price-volatility risk a volatile gas token carries
 *      between when a trade opens and when it settles. Every trade still
 *      records which asset it used, so nothing about the MON path changes.
 *
 * Two properties worth knowing, because they are what make this trustworthy:
 *
 *   • The owner cannot touch escrowed funds. There is no admin withdrawal of
 *     trade money anywhere in this contract. `withdrawFees` can only ever move
 *     `accruedFees`, which is the fee already deducted from settled trades.
 *   • The fee has a hard ceiling of 5% written into the code as a constant.
 *     No owner, now or later, can raise it beyond that.
 */
// Minimal ERC-20 interface, inlined rather than imported so this file still
// deploys from Remix with no dependency resolution — consistent with the
// rest of the project's no-Hardhat, no-Foundry deployment story.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract VeriPayEscrow {
    // ─── Constants ──────────────────────────────────────────────────────────

    uint16 public constant BPS_DENOMINATOR = 10_000; // 10_000 bps = 100%
    uint16 public constant MAX_FEE_BPS = 500;        // 5% ceiling, immutable

    // ─── Configuration ──────────────────────────────────────────────────────

    address public owner;
    address public arbitrator;    // may settle disputed trades
    address public feeRecipient;  // receives withdrawn fees
    uint16  public feeBps;        // current fee, applied to new trades only
    uint64  public autoReleaseDelay; // how long a buyer has before auto-release

    // ─── State ──────────────────────────────────────────────────────────────

    struct Trade {
        // Fields 0-5 keep the exact order of the original contract so existing
        // reads in the app continue to work unchanged.
        address buyer;                // 0
        address seller;               // 1
        uint256 amount;               // 2
        bool    released;             // 3  seller has been paid
        bool    sellerApprovedRefund; // 4
        string  metadata;             // 5
        // Fields added for disputes/fees/auto-release.
        uint64  createdAt;            // 6
        uint64  autoReleaseAt;        // 7
        bool    disputed;             // 8
        bool    refunded;             // 9  buyer has been repaid
        uint16  feeBps;               // 10 rate locked in at creation
        // Field added for ERC-20 escrow support.
        address token;                // 11 address(0) = native MON, else an ERC-20 (e.g. AUSD)
    }

    mapping(uint256 => Trade) public trades;
    uint256 public nextTradeId;

    /// Fees taken from settled trades, waiting to be withdrawn. Kept per asset
    /// — a MON trade's fee and an AUSD trade's fee are not interchangeable.
    /// address(0) is the native-MON bucket.
    mapping(address => uint256) public accruedFees;

    // ─── Events ─────────────────────────────────────────────────────────────
    // The first three keep their original signatures so anything already
    // indexing this contract keeps working.

    event TradeCreated(uint256 indexed id, address indexed buyer, address indexed seller, uint256 amount);
    event FundsReleased(uint256 indexed id, address to);
    event RefundAuthorized(uint256 indexed id);

    event AutoReleased(uint256 indexed id, address to);
    event DisputeRaised(uint256 indexed id, address by);
    event DisputeResolved(uint256 indexed id, uint256 toBuyer, uint256 toSeller);
    event FeeCharged(uint256 indexed id, uint256 amount);
    event FeesWithdrawn(address indexed to, address indexed token, uint256 amount);
    event FeeUpdated(uint16 bps);
    event ArbitratorUpdated(address arbitrator);
    event FeeRecipientUpdated(address feeRecipient);
    event AutoReleaseDelayUpdated(uint64 seconds_);
    event OwnershipTransferred(address indexed from, address indexed to);
    /// Emitted alongside TradeCreated when the trade uses an ERC-20 token,
    /// so indexers (and the reputation feed built on top of them) can filter
    /// by asset without changing TradeCreated's original signature.
    event TradeToken(uint256 indexed id, address indexed token);

    // ─── Guards ─────────────────────────────────────────────────────────────

    uint256 private _lock = 1;

    modifier nonReentrant() {
        require(_lock == 1, "reentrant call");
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// Reverts unless the trade exists and has not already paid out.
    function _requireOpen(Trade storage t) private view {
        require(t.amount > 0, "no such trade");
        require(!t.released && !t.refunded, "already settled");
    }

    // ─── Setup ──────────────────────────────────────────────────────────────

    /**
     * Deploys with the sender as owner, arbitrator and fee recipient, a 1% fee
     * and a 7-day auto-release window. All four are changeable afterwards, so
     * deployment in Remix needs no constructor arguments.
     */
    constructor() {
        owner = msg.sender;
        arbitrator = msg.sender;
        feeRecipient = msg.sender;
        feeBps = 100;              // 1%
        autoReleaseDelay = 7 days;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ─── Trade lifecycle ────────────────────────────────────────────────────

    /**
     * Buyer locks payment for a seller. The value sent is the full trade amount;
     * the fee is taken later, out of the seller's side, and only on success.
     */
    function createTrade(address _seller, string calldata _metadata)
        external
        payable
        returns (uint256 id)
    {
        require(msg.value > 0, "send the payment with this call");
        require(_seller != address(0), "seller required");
        require(_seller != msg.sender, "buyer cannot be the seller");

        id = nextTradeId++;

        Trade storage t = trades[id];
        t.buyer = msg.sender;
        t.seller = _seller;
        t.amount = msg.value;
        t.metadata = _metadata;
        t.createdAt = uint64(block.timestamp);
        t.autoReleaseAt = uint64(block.timestamp) + autoReleaseDelay;
        t.feeBps = feeBps; // locked now, so later fee changes can't reach this trade
        t.token = address(0);

        emit TradeCreated(id, msg.sender, _seller, msg.value);
    }

    /**
     * Same as createTrade, but locks an ERC-20 token (e.g. AUSD) instead of
     * native MON. The buyer must have approved this contract for at least
     * _amount beforehand — this function pulls the tokens via transferFrom.
     */
    function createTradeWithToken(address _seller, string calldata _metadata, address _token, uint256 _amount)
        external
        nonReentrant
        returns (uint256 id)
    {
        require(_token != address(0), "use createTrade for native MON");
        require(_amount > 0, "amount required");
        require(_seller != address(0), "seller required");
        require(_seller != msg.sender, "buyer cannot be the seller");

        id = nextTradeId++;

        Trade storage t = trades[id];
        t.buyer = msg.sender;
        t.seller = _seller;
        t.amount = _amount;
        t.metadata = _metadata;
        t.createdAt = uint64(block.timestamp);
        t.autoReleaseAt = uint64(block.timestamp) + autoReleaseDelay;
        t.feeBps = feeBps;
        t.token = _token;

        require(IERC20(_token).transferFrom(msg.sender, address(this), _amount), "token transfer failed");

        emit TradeCreated(id, msg.sender, _seller, _amount);
        emit TradeToken(id, _token);
    }

    /// Buyer confirms delivery. Allowed even during a dispute — that's the
    /// buyer conceding, and it should never be blocked.
    function releaseToSeller(uint256 _id) external nonReentrant {
        Trade storage t = trades[_id];
        require(msg.sender == t.buyer, "only the buyer can release");
        _requireOpen(t);

        t.released = true;
        _payout(_id, 0, t.amount);

        emit FundsReleased(_id, t.seller);
    }

    /**
     * Pays the seller once the buyer's window has passed without a confirmation
     * or a dispute. Callable by anyone so the seller is never left waiting on
     * a buyer who has simply stopped replying.
     */
    function autoRelease(uint256 _id) external nonReentrant {
        Trade storage t = trades[_id];
        _requireOpen(t);
        require(!t.disputed, "trade is disputed");
        require(block.timestamp >= t.autoReleaseAt, "release window not reached");

        t.released = true;
        _payout(_id, 0, t.amount);

        emit AutoReleased(_id, t.seller);
        emit FundsReleased(_id, t.seller);
    }

    /// Seller agrees to refund. The buyer still has to claim it.
    function sellerApproveRefund(uint256 _id) external {
        Trade storage t = trades[_id];
        require(msg.sender == t.seller, "only the seller can approve");
        _requireOpen(t);

        t.sellerApprovedRefund = true;
        emit RefundAuthorized(_id);
    }

    /// Buyer takes back the full amount. No fee is charged on a refund.
    function buyerClaimRefund(uint256 _id) external nonReentrant {
        Trade storage t = trades[_id];
        require(msg.sender == t.buyer, "only the buyer can claim");
        _requireOpen(t);
        require(t.sellerApprovedRefund, "seller has not approved a refund");

        t.refunded = true;
        _payout(_id, t.amount, 0);

        emit FundsReleased(_id, t.buyer);
    }

    /// Either party flags the trade. Freezes auto-release until an arbitrator rules.
    function raiseDispute(uint256 _id) external {
        Trade storage t = trades[_id];
        require(msg.sender == t.buyer || msg.sender == t.seller, "not a party to this trade");
        _requireOpen(t);
        require(!t.disputed, "already disputed");

        t.disputed = true;
        emit DisputeRaised(_id, msg.sender);
    }

    /**
     * Arbitrator settles a disputed trade.
     *
     * @param _buyerBps share returned to the buyer, in basis points.
     *                  10000 = full refund, 0 = pay the seller in full,
     *                  5000 = split it down the middle.
     *
     * The fee applies only to whatever the seller receives, so a full refund
     * still costs the buyer nothing.
     */
    function resolveDispute(uint256 _id, uint16 _buyerBps) external nonReentrant {
        require(msg.sender == arbitrator, "only the arbitrator can resolve");
        require(_buyerBps <= BPS_DENOMINATOR, "share out of range");

        Trade storage t = trades[_id];
        _requireOpen(t);
        require(t.disputed, "trade is not disputed");

        uint256 toBuyer = (t.amount * _buyerBps) / BPS_DENOMINATOR;
        uint256 toSeller = t.amount - toBuyer;

        // Mark terminal before any transfer.
        t.refunded = toBuyer > 0;
        t.released = toSeller > 0;

        _payout(_id, toBuyer, toSeller);
        emit DisputeResolved(_id, toBuyer, toSeller);
    }

    // ─── Money movement ─────────────────────────────────────────────────────

    /**
     * Sends out a settled trade. The fee is deducted from the seller's portion
     * and held in the contract until withdrawn — it is never sent onward inside
     * a user's transaction. Pays out in whichever asset the trade was opened in.
     */
    function _payout(uint256 _id, uint256 toBuyer, uint256 toSeller) private {
        Trade storage t = trades[_id];

        if (toSeller > 0 && t.feeBps > 0) {
            uint256 fee = (toSeller * t.feeBps) / BPS_DENOMINATOR;
            if (fee > 0) {
                toSeller -= fee;
                accruedFees[t.token] += fee;
                emit FeeCharged(_id, fee);
            }
        }

        if (toBuyer > 0) _send(t.token, t.buyer, toBuyer);
        if (toSeller > 0) _send(t.token, t.seller, toSeller);
    }

    function _send(address token, address to, uint256 value) private {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: value}("");
            require(ok, "transfer failed");
        } else {
            require(IERC20(token).transfer(to, value), "token transfer failed");
        }
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    /// Moves collected fees out, for one asset at a time. Cannot reach money
    /// locked in open trades — accruedFees only ever holds fees already taken
    /// from settled trades.
    function withdrawFees(address _token) external onlyOwner nonReentrant {
        uint256 amount = accruedFees[_token];
        require(amount > 0, "nothing to withdraw");

        accruedFees[_token] = 0;
        _send(_token, feeRecipient, amount);

        emit FeesWithdrawn(feeRecipient, _token, amount);
    }

    function setFeeBps(uint16 _bps) external onlyOwner {
        require(_bps <= MAX_FEE_BPS, "above the 5% ceiling");
        feeBps = _bps;
        emit FeeUpdated(_bps);
    }

    function setArbitrator(address _arbitrator) external onlyOwner {
        require(_arbitrator != address(0), "arbitrator required");
        arbitrator = _arbitrator;
        emit ArbitratorUpdated(_arbitrator);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "recipient required");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setAutoReleaseDelay(uint64 _seconds) external onlyOwner {
        require(_seconds >= 1 days && _seconds <= 90 days, "must be 1-90 days");
        autoReleaseDelay = _seconds;
        emit AutoReleaseDelayUpdated(_seconds);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "owner required");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    /// Convenience read for the app — same data as `trades`, as one struct.
    function getTrade(uint256 _id) external view returns (Trade memory) {
        return trades[_id];
    }

    /// What the seller would actually receive if this trade released right now.
    function previewSellerProceeds(uint256 _id) external view returns (uint256 net, uint256 fee) {
        Trade storage t = trades[_id];
        fee = (t.amount * t.feeBps) / BPS_DENOMINATOR;
        net = t.amount - fee;
    }

    /// Total value of one asset currently held on behalf of open trades.
    /// Pass address(0) for native MON.
    function escrowedBalance(address _token) external view returns (uint256) {
        if (_token == address(0)) {
            return address(this).balance - accruedFees[address(0)];
        }
        return IERC20(_token).balanceOf(address(this)) - accruedFees[_token];
    }

    /// Reject stray native transfers — MON must arrive through createTrade.
    receive() external payable {
        revert("use createTrade to send funds");
    }
}
