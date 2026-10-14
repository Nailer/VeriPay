import { test, before } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, parseEther, parseEventLogs, zeroAddress } from "viem";
import { compile, startChain, expectRevert } from "./harness.mjs";

const DAY = 86_400;
const { escrow: E, receiver: R } = compile();
let c, owner, buyer, seller, forwarder, stranger, newForwarder, escrow, receiver;
let nextId = 0n;

before(async () => {
  c = await startChain();
  [owner, buyer, seller, forwarder, stranger, newForwarder] = c.accounts;
  escrow = await c.deploy(E);
  receiver = await c.deploy(R, [forwarder, escrow]);
});

const open = async () => { await c.send(buyer, escrow, E.abi, "createTrade", [seller, "item"], parseEther("1")); return nextId++; };
const report = (ids) => encodeAbiParameters([{ type: "uint256[]" }], [ids]);
const deliver = (from, ids) => c.send(from, receiver, R.abi, "onReport", ["0x", report(ids)]);
const events = (receipt) => parseEventLogs({ abi: R.abi, logs: receipt.logs });

test("constructor refuses a zero forwarder or a zero escrow", async () => {
  await expectRevert(c.deploy(R, [zeroAddress, escrow]));
  await expectRevert(c.deploy(R, [forwarder, zeroAddress]));
  assert.equal((await c.read(receiver, R.abi, "escrow")).toLowerCase(), escrow.toLowerCase());
});

test("a report from anyone but the trusted forwarder is rejected", async () => {
  const id = await open();
  await c.warp(7 * DAY + 1);
  await expectRevert(deliver(stranger, [id]));
  await expectRevert(deliver(owner, [id]));
  assert.equal((await c.read(escrow, E.abi, "getTrade", [id])).released, false);
});

test("a report from the forwarder releases a due trade and pays the seller", async () => {
  const id = nextId - 1n; // still open from the previous test, window already passed
  const before = await c.balance(seller);
  const receipt = await deliver(forwarder, [id]);
  assert.equal((await c.balance(seller)) - before, parseEther("0.99"));
  assert.deepEqual(events(receipt).map((e) => e.eventName), ["AutoReleaseSucceeded"]);
});

test("the receiver cannot release a trade early — the escrow's own checks still apply", async () => {
  const id = await open();
  const receipt = await deliver(forwarder, [id]);
  const [ev] = events(receipt);
  assert.equal(ev.eventName, "AutoReleaseFailed");
  assert.equal(ev.args.reason, "release window not reached");
  assert.equal((await c.read(escrow, E.abi, "getTrade", [id])).released, false);
});

test("one bad trade in a batch does not block the rest", async () => {
  const due1 = await open();
  const disputed = await open();
  const due2 = await open();
  await c.send(buyer, escrow, E.abi, "raiseDispute", [disputed]);
  await c.warp(7 * DAY + 1);
  await c.send(buyer, escrow, E.abi, "releaseToSeller", [due1]); // settled by hand before the report lands

  const receipt = await deliver(forwarder, [due1, disputed, 9999n, due2]);
  const got = events(receipt).map((e) => [e.eventName, e.args.tradeId, e.args.reason]);
  assert.deepEqual(got, [
    ["AutoReleaseFailed", due1, "already settled"],
    ["AutoReleaseFailed", disputed, "trade is disputed"],
    ["AutoReleaseFailed", 9999n, "no such trade"],
    ["AutoReleaseSucceeded", due2, undefined],
  ]);
  assert.equal((await c.read(escrow, E.abi, "getTrade", [due2])).released, true);
  assert.equal((await c.read(escrow, E.abi, "getTrade", [disputed])).released, false);
});

test("only the owner can rotate the forwarder, and the old one stops working", async () => {
  await expectRevert(c.send(stranger, receiver, R.abi, "setForwarderAddress", [stranger]));
  await c.send(owner, receiver, R.abi, "setForwarderAddress", [newForwarder]);
  assert.equal((await c.read(receiver, R.abi, "getForwarderAddress")).toLowerCase(), newForwarder);
  await expectRevert(deliver(forwarder, []));
  await deliver(newForwarder, []);
});

test("the receiver never holds funds", async () => {
  assert.equal(await c.balance(receiver), 0n);
});
