// ABI for contracts/VeriPayEscrow.sol
//
// Struct fields 0-5 (buyer, seller, amount, released, sellerApprovedRefund,
// metadata) are in the same order as the original contract, so existing reads
// that index into `trades(...)` keep working. New fields are appended after —
// field 11 (`token`) is address(0) for a native-MON trade, or an ERC-20
// address (e.g. Agora's AUSD) for a token trade.

export const escrowAbi = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },

  // ─── Trade lifecycle ──────────────────────────────────────────────────────
  {
    "inputs": [
      { "internalType": "address", "name": "_seller", "type": "address" },
      { "internalType": "string", "name": "_metadata", "type": "string" }
    ],
    "name": "createTrade",
    "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_seller", "type": "address" },
      { "internalType": "string", "name": "_metadata", "type": "string" },
      { "internalType": "address", "name": "_token", "type": "address" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" }
    ],
    "name": "createTradeWithToken",
    "outputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "releaseToSeller",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "autoRelease",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "sellerApproveRefund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "buyerClaimRefund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "raiseDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_id", "type": "uint256" },
      { "internalType": "uint16", "name": "_buyerBps", "type": "uint16" }
    ],
    "name": "resolveDispute",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // ─── Reads ────────────────────────────────────────────────────────────────
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "trades",
    "outputs": [
      { "internalType": "address", "name": "buyer", "type": "address" },
      { "internalType": "address", "name": "seller", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "bool", "name": "released", "type": "bool" },
      { "internalType": "bool", "name": "sellerApprovedRefund", "type": "bool" },
      { "internalType": "string", "name": "metadata", "type": "string" },
      { "internalType": "uint64", "name": "createdAt", "type": "uint64" },
      { "internalType": "uint64", "name": "autoReleaseAt", "type": "uint64" },
      { "internalType": "bool", "name": "disputed", "type": "bool" },
      { "internalType": "bool", "name": "refunded", "type": "bool" },
      { "internalType": "uint16", "name": "feeBps", "type": "uint16" },
      { "internalType": "address", "name": "token", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "getTrade",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "buyer", "type": "address" },
          { "internalType": "address", "name": "seller", "type": "address" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" },
          { "internalType": "bool", "name": "released", "type": "bool" },
          { "internalType": "bool", "name": "sellerApprovedRefund", "type": "bool" },
          { "internalType": "string", "name": "metadata", "type": "string" },
          { "internalType": "uint64", "name": "createdAt", "type": "uint64" },
          { "internalType": "uint64", "name": "autoReleaseAt", "type": "uint64" },
          { "internalType": "bool", "name": "disputed", "type": "bool" },
          { "internalType": "bool", "name": "refunded", "type": "bool" },
          { "internalType": "uint16", "name": "feeBps", "type": "uint16" },
          { "internalType": "address", "name": "token", "type": "address" }
        ],
        "internalType": "struct VeriPayEscrow.Trade",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_id", "type": "uint256" }],
    "name": "previewSellerProceeds",
    "outputs": [
      { "internalType": "uint256", "name": "net", "type": "uint256" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [], "name": "nextTradeId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "accruedFees",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_token", "type": "address" }],
    "name": "escrowedBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "feeBps",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "MAX_FEE_BPS",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "BPS_DENOMINATOR",
    "outputs": [{ "internalType": "uint16", "name": "", "type": "uint16" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "autoReleaseDelay",
    "outputs": [{ "internalType": "uint64", "name": "", "type": "uint64" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "owner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "arbitrator",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view", "type": "function"
  },
  {
    "inputs": [], "name": "feeRecipient",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view", "type": "function"
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  {
    "inputs": [{ "internalType": "address", "name": "_token", "type": "address" }],
    "name": "withdrawFees",
    "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint16", "name": "_bps", "type": "uint16" }],
    "name": "setFeeBps", "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_arbitrator", "type": "address" }],
    "name": "setArbitrator", "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_feeRecipient", "type": "address" }],
    "name": "setFeeRecipient", "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint64", "name": "_seconds", "type": "uint64" }],
    "name": "setAutoReleaseDelay", "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_newOwner", "type": "address" }],
    "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function"
  },

  // ─── Events ───────────────────────────────────────────────────────────────
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "buyer", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "seller", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "TradeCreated", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "FundsReleased", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "RefundAuthorized", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "AutoReleased", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "by", "type": "address" }
    ],
    "name": "DisputeRaised", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toBuyer", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "toSeller", "type": "uint256" }
    ],
    "name": "DisputeResolved", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "FeeCharged", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "token", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "FeesWithdrawn", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "token", "type": "address" }
    ],
    "name": "TradeToken", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint16", "name": "bps", "type": "uint16" }],
    "name": "FeeUpdated", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "arbitrator", "type": "address" }],
    "name": "ArbitratorUpdated", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "address", "name": "feeRecipient", "type": "address" }],
    "name": "FeeRecipientUpdated", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [{ "indexed": false, "internalType": "uint64", "name": "seconds_", "type": "uint64" }],
    "name": "AutoReleaseDelayUpdated", "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "OwnershipTransferred", "type": "event"
  },

  { "stateMutability": "payable", "type": "receive" }
] as const;

// Set NEXT_PUBLIC_CONTRACT_ADDRESS to your newly deployed VeriPayEscrow.
// The fallback below is the ORIGINAL contract, which has no fee and no
// arbitration — the app will not read it correctly with this ABI.
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xd0cc532f55ce6849d5b70e24d6188073f8921621") as `0x${string}`;
