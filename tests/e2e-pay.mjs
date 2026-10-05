// End-to-end test of the pay-link money path against a RUNNING local server
// and the live Monad testnet. Makes a real Paystack TEST-mode card charge.
//
//   npm run build && npm run start        (in one terminal)
//   node tests/e2e-pay.mjs                (in another)
//
// Needs a filled-in .env (see .env.example), including PAYSTACK_SECRET_KEY
// and PAY_MINTER_PRIVATE_KEY. Creates one throwaway seller and one on-chain
// test trade, then deletes the seller row. No real money moves.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatEther, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim();
const RPC = get("NEXT_PUBLIC_MONAD_RPC_URL"), SK = get("PAYSTACK_SECRET_KEY");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ESCROW = "0x00bdf9fbc9f59cc6814bbc7a91b19bbad1517e6d", TOKEN = "0xdbb53d0a2d1b91ef6a41cf1128fef562ffc531eb";
const chain = { id: 10143, name: "m", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 5 }) });
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const escrowAbi = JSON.parse(fs.readFileSync(path.join(root, "indexer/abis/VeriPayEscrow.json"), "utf8"));
let pass = 0, failN = 0; const check = (l, c) => { c ? pass++ : failN++; console.log(`  ${c ? "OK  " : "FAIL"} ${l}`); };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
const charge = async (reference, amountNgn) => {
  const r = await fetch("https://api.paystack.co/charge", { method: "POST", headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com", amount: Math.round(amountNgn * 100), reference, card: { number: "4084084084084081", cvv: "408", expiry_month: "12", expiry_year: "30" } }) });
  const j = await r.json(); return j.data?.status || j.message;
};

console.log("status:", JSON.stringify(await (await fetch(BASE + "/api/pay/intent")).json()));
const seller = privateKeyToAccount(generatePrivateKey()), buyer = privateKeyToAccount(generatePrivateKey()), other = privateKeyToAccount(generatePrivateKey());
const handle = "e2e-" + Math.random().toString(36).slice(2, 8);
const msg = (h, a) => `VeriPay: I am claiming the payment link "${h}" for ${a.toLowerCase()}.`;

console.log("\nSeller link");
let r = await post("/api/sellers", { handle, name: "E2E Test Shop", address: seller.address, signature: await other.signMessage({ message: msg(handle, seller.address) }) });
check("claim signed by the WRONG key is rejected", r.status === 401);
r = await post("/api/sellers", { handle, name: "E2E Test Shop", address: seller.address, signature: await seller.signMessage({ message: msg(handle, seller.address) }) });
check("claim signed by the owner succeeds", r.status === 200 && r.body.seller?.handle === handle);
r = await post("/api/sellers", { handle, name: "Squatter", address: other.address, signature: await other.signMessage({ message: msg(handle, other.address) }) });
check("taken handle can't be claimed twice", r.status === 409);

console.log("\nPayment");
r = await post("/api/pay/intent", { handle, amountNgn: 2500, item: "Black Ankara gown", buyerAddress: buyer.address, email: "buyer@example.com" });
check("intent created", r.status === 200 && r.body.intent?.sellerAddress === seller.address.toLowerCase());
const A = r.body;
r = await post("/api/pay/confirm", { id: A.intent.id, reference: A.reference });
check("confirm BEFORE paying is rejected", r.status === 400);
console.log("  paystack test charge:", await charge(A.reference, 2500));
r = await post("/api/pay/confirm", { id: A.intent.id, reference: A.reference });
check("confirm after a real test charge -> funded", r.status === 200 && r.body.intent?.status === "funded");
const bal = await pub.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [buyer.address] });
check("buyer holds exactly 2,500 vNGN", bal === parseUnits("2500", 6));
const gas = await pub.getBalance({ address: buyer.address });
check(`buyer was topped up with gas (${formatEther(gas)} MON)`, gas > 0n);
r = await post("/api/pay/confirm", { id: A.intent.id, reference: A.reference });
const bal2 = await pub.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [buyer.address] });
check("replaying confirm does not mint twice", r.status === 200 && bal2 === bal);

r = await post("/api/pay/intent", { handle, amountNgn: 50000, item: "iPhone 12", buyerAddress: buyer.address, email: "buyer@example.com" });
const B = r.body;
r = await post("/api/pay/confirm", { id: B.intent.id, reference: A.reference });
check("a ₦2,500 payment can't be reused to fund a ₦50,000 one", r.status === 400);
r = await post("/api/pay/intent", { handle, amountNgn: 2500, item: "self", buyerAddress: seller.address, email: "s@example.com" });
check("seller can't pay their own link", r.status === 400);

console.log("\nLock in escrow (same calls the page makes)");
const w = createWalletClient({ account: buyer, chain, transport: http(RPC, { retryCount: 5 }) });
const wait = (hash) => pub.waitForTransactionReceipt({ hash, timeout: 60000 });
await wait(await w.writeContract({ address: TOKEN, abi: erc20, functionName: "approve", args: [ESCROW, bal] }));
const id = await pub.readContract({ address: ESCROW, abi: escrowAbi, functionName: "nextTradeId" });
const t0 = Date.now();
const rc = await wait(await w.writeContract({ address: ESCROW, abi: escrowAbi, functionName: "createTradeWithToken", args: [seller.address, "Black Ankara gown", TOKEN, bal] }));
const t = await pub.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getTrade", args: [id] });
check(`trade #${id} locked ₦${formatUnits(t.amount, 6)} for the seller in ${Date.now() - t0}ms`, rc.status === "success" && t.seller === seller.address && t.amount === bal);
check("gas top-up was enough for both transactions", (await pub.getBalance({ address: buyer.address })) > 0n);
const rep = await (await fetch(`${BASE}/api/reputation/${seller.address}?trades=1`)).json();
check("trade shows on the seller's record in naira", rep.trades?.[0]?.symbol === "NGN" && rep.trades?.[0]?.amount === "2,500");
// Clean up the throwaway seller (the on-chain test trade stays, by nature).
if (get("SUPABASE_SERVICE_ROLE_KEY") && get("SUPABASE_URL")) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(get("SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));
  await sb.from("pay_intents").delete().eq("handle", handle);
  await sb.from("sellers").delete().eq("handle", handle);
}
console.log(`\n${pass} passed, ${failN} failed  (handle: ${handle}, trade #${id})`);
process.exit(failN ? 1 : 0);
