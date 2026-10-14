// Drives the real app (local production build → live Monad testnet, Paystack
// test mode) through the full buyer/seller flow and records each phone screen.
// Writes vid/scenes.json for compose.mjs to cut and narrate.
import fs from "fs";
import { chromium } from "playwright-core";
const BASE = "http://localhost:3000";
const CRE_TX = "0xa5cf52aeac617514c10055bf703c2766eb5366f640958c171006681b9d87f823";
const VIEW = { width: 390, height: 844 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scenes = []; const people = {};

async function person(name) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark", recordVideo: { dir: `vid/raw/${name}`, size: { width: VIEW.width * 2, height: VIEW.height * 2 } } });
  const wire = async (page) => {
    page.t0 = Date.now();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
  };
  const page = await ctx.newPage(); await wire(page);
  people[name] = { ctx, page };
  return page;
}
const at = (page) => (Date.now() - page.t0) / 1000;
/** Record [from, now] of this page as (part of) a scene. */
const clip = (id, page, from) => { console.log("scene", id, "done"); let s = scenes.find((x) => x.id === id); if (!s) scenes.push((s = { id, clips: [] })); s.clips.push({ page, a: from, b: at(page) }); };

const handle = process.env.HANDLE || "adaeze-thrift";
let t;

// 1 ── the problem (homepage)
const B = await person("buyer");
await B.goto(BASE + "/"); await sleep(1200); t = at(B);
await sleep(5000); await B.mouse.wheel(0, 500); await sleep(4000); await B.mouse.wheel(0, 500); await sleep(4000);
clip("intro", B, t);

// 2 ── seller claims a link
const S = await person("seller");
await S.goto(BASE + "/sell"); await sleep(1500); t = at(S);
await sleep(2000);
await S.getByRole("button", { name: /fingerprint/i }).first().click();
await S.getByPlaceholder("Adaeze Thrift").waitFor({ timeout: 30000 }); await sleep(900);
await S.getByPlaceholder("Adaeze Thrift").pressSequentially("Adaeze Thrift", { delay: 70 }); await sleep(400);
await S.getByPlaceholder("adaeze-thrift").pressSequentially(handle, { delay: 70 }); await sleep(900);
await S.getByRole("button", { name: /create my link/i }).click();
await S.getByRole("button", { name: /copy link/i }).waitFor({ timeout: 30000 }); await sleep(3500);
clip("seller-link", S, t);

// 3 ── buyer opens the link, sees the record, fills the form
await B.goto(`${BASE}/pay/${handle}`); await B.getByPlaceholder("25,000").waitFor(); await sleep(1500); t = at(B);
await sleep(3500);
await B.getByPlaceholder("25,000").scrollIntoViewIfNeeded(); await sleep(600);
await B.getByPlaceholder("25,000").pressSequentially("5000", { delay: 110 }); await sleep(300);
await B.getByPlaceholder(/Ankara/).pressSequentially("Black Ankara gown, size 12", { delay: 45 }); await sleep(300);
await B.getByPlaceholder("you@example.com").pressSequentially("tola@example.com", { delay: 45 }); await sleep(500);
await B.getByRole("button", { name: /fingerprint/i }).first().scrollIntoViewIfNeeded();
await B.getByRole("button", { name: /fingerprint/i }).first().click();
const payBtn = B.getByRole("button", { name: /pay .* safely/i });
await payBtn.waitFor({ timeout: 30000 }); await sleep(1500);
await payBtn.click();
const pop = B.frameLocator('iframe[src*="checkout.paystack.com"]');
await pop.locator('[data-testid="testCardsPaymentButton"]').waitFor({ timeout: 45000 }); await sleep(2000);
await pop.getByText("Success", { exact: true }).first().click(); await sleep(1800);
clip("buyer-pay", B, t);

// 4 ── charge → locked → receipt, in real time (never cut or sped up)
t = at(B);
await pop.locator('[data-testid="testCardsPaymentButton"]').click();
await B.getByText("Payment secured").waitFor({ timeout: 120000 });
await sleep(9000);
clip("lock", B, t);
const receipt = await B.locator("body").innerText();
const tradeId = receipt.match(/#0*(\d+)/)?.[1];
console.log("receipt:", receipt.match(/Secured in[^\n]*/)?.[0], "| order", tradeId);

// 5 ── proof, read live from Monad inside the app
await B.getByRole("link", { name: /view proof on monad/i }).click();
await B.getByText("Confirmed on Monad").waitFor({ timeout: 30000 }); await sleep(600); t = at(B) - 1.6;
await sleep(5000); await B.mouse.wheel(0, 420); await sleep(5500);
clip("proof", B, t);
await B.screenshot({ path: "vid/x-proof.png" });

// 6 ── seller's page shows the order by itself
await S.getByText(/deliver this order/i).waitFor({ timeout: 60000 });
await S.getByText(/deliver this order/i).scrollIntoViewIfNeeded(); await sleep(600); t = at(S);
await sleep(5000);
clip("seller-order", S, t);

// 7 ── buyer finds the order and confirms delivery
await B.mouse.wheel(0, -2000); await sleep(400); t = at(B);
await B.getByRole("button", { name: "Toggle menu" }).click(); await sleep(1200);
await B.getByRole("link", { name: "My orders" }).first().click();
await B.getByText(/confirm when it arrives/i).waitFor({ timeout: 30000 }); await sleep(2200);
await B.getByText(/confirm when it arrives/i).click();
const got = B.getByRole("button", { name: /I received my order/i });
await got.waitFor({ timeout: 30000 }); await sleep(1800);
await got.scrollIntoViewIfNeeded(); await sleep(1500);
await got.click();
await B.getByText(/seller has been paid/i).waitFor({ timeout: 90000 });
await B.mouse.wheel(0, -2000); await sleep(4500);
clip("release", B, t);

// wait (off camera) until the public record reflects it
const sellerAddr = (await (await fetch(`${BASE}/api/sellers?handle=${handle}`)).json()).seller.address;
for (let i = 0; i < 40; i++) { const r = await (await fetch(`${BASE}/api/reputation/${sellerAddr}`)).json(); if (r.reputation?.completedTrades >= 1) break; await sleep(3000); }

// 8 ── anyone can check the seller
await B.goto(BASE + "/seller"); await B.getByPlaceholder("e.g. adaeze-thrift").waitFor(); await sleep(1000); t = at(B);
await sleep(1200);
await B.getByPlaceholder("e.g. adaeze-thrift").pressSequentially(handle, { delay: 70 }); await sleep(600);
await B.getByRole("button", { name: /check record/i }).click();
await B.getByRole("heading", { name: "Adaeze Thrift" }).waitFor({ timeout: 30000 });
await B.getByText(/paid out/i).first().waitFor({ timeout: 30000 }).catch(() => {});
await sleep(11000);
clip("record", B, t);
await B.screenshot({ path: "vid/x-record.png" });

// 9 ── the Chainlink auto-release transaction, same live proof page
await B.goto(`${BASE}/proof/${CRE_TX}`); await B.getByText("Confirmed on Monad").waitFor({ timeout: 30000 }); await sleep(500); t = at(B) - 0.4;
await sleep(7000); await B.mouse.wheel(0, 300); await sleep(8000);
clip("chainlink", B, t);
await B.screenshot({ path: "vid/x-chainlink.png" });

// 10 ── close
await B.goto(BASE + "/"); await sleep(1500); t = at(B); await sleep(8000);
clip("close", B, t);

// One page per person, so one video file per folder. Write the cut list
// before closing: closing has hung before, and the timings must not be lost.
await sleep(1500);
const fileOf = (page) => { const who = page === S ? "seller" : "buyer"; const f = fs.readdirSync(`vid/raw/${who}`).find((x) => x.endsWith(".webm")); return `vid/raw/${who}/${f}`; };
const out = scenes.map((s) => ({ id: s.id, clips: s.clips.map((c) => ({ file: fileOf(c.page), a: +c.a.toFixed(2), b: +c.b.toFixed(2) })) }));
fs.writeFileSync("vid/scenes.json", JSON.stringify({ handle, tradeId, scenes: out }, null, 1));
console.log(out.map((s) => `${s.id}: ${s.clips.map((c) => (c.b - c.a).toFixed(1) + "s").join("+")}`).join("\n"));
await Promise.race([(async () => { for (const p of Object.values(people)) await p.ctx.close(); await browser.close(); })(), sleep(25000)]);
console.log("closed");
process.exit(0);
