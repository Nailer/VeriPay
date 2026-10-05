import { test, before } from "node:test";
import assert from "node:assert/strict";
import { parseEther, parseUnits, zeroAddress } from "viem";
import { compile, startChain, expectRevert } from "./harness.mjs";

const DAY = 86_400;
const { escrow: E, token: T } = compile();
let c, owner, buyer, seller, stranger, escrow, token;
let nextId = 0n;

before(async () => {
  c = await startChain();
  [owner, buyer, seller, stranger] = c.accounts;
  escrow = await c.deploy(E);
  token = await c.deploy(T);
  await c.send(owner, token, T.abi, "mint", [buyer, parseUnits("1000000", 6)]);
  await c.send(buyer, token, T.abi, "approve", [escrow, parseUnits("1000000", 6)]);
});

const call = (from, fn, args = [], value) => c.send(from, escrow, E.abi, fn, args, value);
const view = (fn, args = []) => c.read(escrow, E.abi, fn, args);
const openNative = async (amount = "1") => { await call(buyer, "createTrade", [seller, "item"], parseEther(amount)); return nextId++; };
const openToken = async (amount = "25000") => { await call(buyer, "createTradeWithToken", [seller, "item", token, parseUnits(amount, 6)]); return nextId++; };
const tokenBal = (who) => c.read(token, T.abi, "balanceOf", [who]);

// ─── Deployment ────────────────────────────────────────────────────────────

test("deploys with a 1% fee, 7-day window, and the deployer in every role", async () => {
  assert.equal((await view("owner")).toLowerCase(), owner);
  assert.equal((await view("arbitrator")).toLowerCase(), owner);
  assert.equal((await view("feeRecipient")).toLowerCase(), owner);
  assert.equal(await view("feeBps"), 100);
  assert.equal(await view("autoReleaseDelay"), BigInt(7 * DAY));
  assert.equal(await view("MAX_FEE_BPS"), 500);
});

// ─── Native MON lifecycle ──────────────────────────────────────────────────

test("createTrade locks the full amount and records the trade", async () => {
  const id = await openNative("2");
  const t = await view("getTrade", [id]);
  assert.equal(t.buyer.toLowerCase(), buyer);
  assert.equal(t.seller.toLowerCase(), seller);
  assert.equal(t.amount, parseEther("2"));
  assert.equal(t.token, zeroAddress);
  assert.equal(t.feeBps, 100);
  assert.equal(t.autoReleaseAt - t.createdAt, BigInt(7 * DAY));
  assert.equal(t.released, false);
});

test("createTrade rejects zero value, a zero seller, and buying from yourself", async () => {
  await expectRevert(call(buyer, "createTrade", [seller, "x"], 0n), "send the payment");
  await expectRevert(call(buyer, "createTrade", [zeroAddress, "x"], 1n), "seller required");
  await expectRevert(call(buyer, "createTrade", [buyer, "x"], 1n), "buyer cannot be the seller");
});

test("release pays the seller 99% and keeps exactly 1% as a fee", async () => {
  const id = await openNative("1");
  const feesBefore = await view("accruedFees", [zeroAddress]);
  const sellerBefore = await c.balance(seller);
  await call(buyer, "releaseToSeller", [id]);
  assert.equal((await c.balance(seller)) - sellerBefore, parseEther("0.99"));
  assert.equal((await view("accruedFees", [zeroAddress])) - feesBefore, parseEther("0.01"));
  assert.equal((await view("getTrade", [id])).released, true);
});

test("only the buyer can release, and a trade can't be settled twice", async () => {
  const id = await openNative();
  await expectRevert(call(seller, "releaseToSeller", [id]), "only the buyer can release");
  await expectRevert(call(stranger, "releaseToSeller", [id]), "only the buyer can release");
  await call(buyer, "releaseToSeller", [id]);
  await expectRevert(call(buyer, "releaseToSeller", [id]), "already settled");
  await expectRevert(call(stranger, "autoRelease", [id]), "already settled");
});

test("a refund needs the seller's approval and charges no fee", async () => {
  const id = await openNative("1");
  await expectRevert(call(buyer, "buyerClaimRefund", [id]), "seller has not approved");
  await expectRevert(call(buyer, "sellerApproveRefund", [id]), "only the seller can approve");
  await call(seller, "sellerApproveRefund", [id]);
  await expectRevert(call(stranger, "buyerClaimRefund", [id]), "only the buyer can claim");

  const feesBefore = await view("accruedFees", [zeroAddress]);
  const before = await c.balance(buyer);
  const receipt = await call(buyer, "buyerClaimRefund", [id]);
  assert.equal((await c.balance(buyer)) - before + c.gasCost(receipt), parseEther("1"));
  assert.equal(await view("accruedFees", [zeroAddress]), feesBefore);
  assert.equal((await view("getTrade", [id])).refunded, true);
});

test("auto-release is blocked before the window and open to anyone after it", async () => {
  const id = await openNative("1");
  await expectRevert(call(stranger, "autoRelease", [id]), "release window not reached");
  await c.warp(7 * DAY + 1);
  const before = await c.balance(seller);
  await call(stranger, "autoRelease", [id]);
  assert.equal((await c.balance(seller)) - before, parseEther("0.99"));
});

// ─── Disputes ──────────────────────────────────────────────────────────────

test("only a party to the trade can raise a dispute, and only once", async () => {
  const id = await openNative();
  await expectRevert(call(stranger, "raiseDispute", [id]), "not a party");
  await call(seller, "raiseDispute", [id]);
  await expectRevert(call(buyer, "raiseDispute", [id]), "already disputed");
});

test("a dispute freezes auto-release even after the window passes", async () => {
  const id = await openNative();
  await call(buyer, "raiseDispute", [id]);
  await c.warp(8 * DAY);
  await expectRevert(call(stranger, "autoRelease", [id]), "trade is disputed");
});

test("only the arbitrator resolves, only disputed trades, and shares can't exceed 100%", async () => {
  const id = await openNative();
  await expectRevert(call(owner, "resolveDispute", [id, 5000]), "trade is not disputed");
  await call(buyer, "raiseDispute", [id]);
  await expectRevert(call(buyer, "resolveDispute", [id, 10000]), "only the arbitrator");
  await expectRevert(call(owner, "resolveDispute", [id, 10001]), "share out of range");
});

test("full refund ruling returns everything to the buyer with no fee", async () => {
  const id = await openNative("1");
  await call(buyer, "raiseDispute", [id]);
  const feesBefore = await view("accruedFees", [zeroAddress]);
  const before = await c.balance(buyer);
  await call(owner, "resolveDispute", [id, 10000]);
  assert.equal((await c.balance(buyer)) - before, parseEther("1"));
  assert.equal(await view("accruedFees", [zeroAddress]), feesBefore);
});

test("a 50/50 ruling charges the fee on the seller's half only", async () => {
  const id = await openNative("1");
  await call(seller, "raiseDispute", [id]);
  const feesBefore = await view("accruedFees", [zeroAddress]);
  const [buyerBefore, sellerBefore] = [await c.balance(buyer), await c.balance(seller)];
  await call(owner, "resolveDispute", [id, 5000]);
  assert.equal((await c.balance(buyer)) - buyerBefore, parseEther("0.5"));
  assert.equal((await c.balance(seller)) - sellerBefore, parseEther("0.495"));
  assert.equal((await view("accruedFees", [zeroAddress])) - feesBefore, parseEther("0.005"));
});

// ─── ERC-20 (naira / AUSD) lifecycle ───────────────────────────────────────

test("createTradeWithToken pulls the tokens in and records the asset", async () => {
  const before = await tokenBal(escrow);
  const id = await openToken("25000");
  const t = await view("getTrade", [id]);
  assert.equal(t.token.toLowerCase(), token.toLowerCase());
  assert.equal(t.amount, parseUnits("25000", 6));
  assert.equal((await tokenBal(escrow)) - before, parseUnits("25000", 6));
});

test("createTradeWithToken rejects the zero token, a zero amount, and unapproved spends", async () => {
  await expectRevert(call(buyer, "createTradeWithToken", [seller, "x", zeroAddress, 1n]), "use createTrade");
  await expectRevert(call(buyer, "createTradeWithToken", [seller, "x", token, 0n]), "amount required");
  await expectRevert(call(stranger, "createTradeWithToken", [seller, "x", token, 1n]));
});

test("token release pays the seller 99% in the same token; fees are tracked per asset", async () => {
  const id = await openToken("25000");
  const [sellerBefore, tokenFees, nativeFees] = [await tokenBal(seller), await view("accruedFees", [token]), await view("accruedFees", [zeroAddress])];
  await call(buyer, "releaseToSeller", [id]);
  assert.equal((await tokenBal(seller)) - sellerBefore, parseUnits("24750", 6));
  assert.equal((await view("accruedFees", [token])) - tokenFees, parseUnits("250", 6));
  assert.equal(await view("accruedFees", [zeroAddress]), nativeFees, "a token fee must not land in the MON bucket");
});

test("token refund returns the full amount", async () => {
  const id = await openToken("5000");
  const before = await tokenBal(buyer);
  await call(seller, "sellerApproveRefund", [id]);
  await call(buyer, "buyerClaimRefund", [id]);
  assert.equal((await tokenBal(buyer)) - before, parseUnits("5000", 6));
});

test("token dispute split pays both sides in the token", async () => {
  const id = await openToken("10000");
  await call(buyer, "raiseDispute", [id]);
  const [b, s] = [await tokenBal(buyer), await tokenBal(seller)];
  await call(owner, "resolveDispute", [id, 2500]);
  assert.equal((await tokenBal(buyer)) - b, parseUnits("2500", 6));
  assert.equal((await tokenBal(seller)) - s, parseUnits("7425", 6)); // 7,500 less 1%
});

// ─── What the owner can and cannot do ──────────────────────────────────────

test("the fee can never be set above the 5% ceiling", async () => {
  await expectRevert(call(owner, "setFeeBps", [501]), "above the 5% ceiling");
  await expectRevert(call(stranger, "setFeeBps", [0]), "not owner");
});

test("changing the fee does not change it for trades that are already open", async () => {
  const id = await openNative("1");
  await call(owner, "setFeeBps", [500]);
  const before = await c.balance(seller);
  await call(buyer, "releaseToSeller", [id]);
  assert.equal((await c.balance(seller)) - before, parseEther("0.99"), "open trade keeps its 1% rate");
  const id2 = await openNative("1");
  assert.equal((await view("getTrade", [id2])).feeBps, 500);
  await call(owner, "setFeeBps", [100]);
});

test("withdrawFees moves only the fees — money held for open trades stays put", async () => {
  const id = await openNative("3");
  const fees = await view("accruedFees", [zeroAddress]);
  const held = await view("escrowedBalance", [zeroAddress]);
  assert.ok(fees > 0n && held >= parseEther("3"));
  await expectRevert(call(stranger, "withdrawFees", [zeroAddress]), "not owner");

  const before = await c.balance(owner);
  const receipt = await call(owner, "withdrawFees", [zeroAddress]);
  assert.equal((await c.balance(owner)) - before + c.gasCost(receipt), fees);
  assert.equal(await view("accruedFees", [zeroAddress]), 0n);
  assert.equal(await view("escrowedBalance", [zeroAddress]), held, "escrowed money untouched");
  assert.equal(await c.balance(escrow), held);
  await expectRevert(call(owner, "withdrawFees", [zeroAddress]), "nothing to withdraw");
  await call(buyer, "releaseToSeller", [id]);
});

test("token fees are withdrawn separately, to the fee recipient", async () => {
  const fees = await view("accruedFees", [token]);
  assert.ok(fees > 0n);
  const before = await tokenBal(owner);
  await call(owner, "withdrawFees", [token]);
  assert.equal((await tokenBal(owner)) - before, fees);
});

test("the auto-release window must stay between 1 and 90 days", async () => {
  await expectRevert(call(owner, "setAutoReleaseDelay", [DAY - 1]), "must be 1-90 days");
  await expectRevert(call(owner, "setAutoReleaseDelay", [91 * DAY]), "must be 1-90 days");
});

test("plain MON sent to the contract is rejected", async () => {
  await expectRevert(c.pub.call({ account: stranger, to: escrow, value: 1n }), "use createTrade");
});
