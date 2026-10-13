// Cuts the recorded phone screens into scenes, adds a narration track
// (macOS text-to-speech) and a title card beside the phone, and joins them.
import fs from "fs"; import { execFileSync } from "child_process"; import { createRequire } from "module";
const sharp = createRequire(import.meta.url)("../node_modules/sharp");
const { scenes } = JSON.parse(fs.readFileSync("vid/scenes.json", "utf8"));
const VOICE = process.env.VOICE || "Daniel", RATE = process.env.RATE || "172";
const W = 1280, H = 720, PH = 664, PW = Math.round(PH * 390 / 844 / 2) * 2, PX = 150, PY = 28;
fs.mkdirSync("vid/out", { recursive: true });

const META = {
  intro: { label: "THE PROBLEM", title: ["Buying from strangers", "online is a gamble."],
    say: "In Nigeria, most online shopping happens on Instagram and WhatsApp, between strangers. The seller says, pay first. The buyer says, deliver first. Someone has to take the risk. VeriPay removes it." },
  "seller-link": { label: "THE SELLER", title: ["One payment link.", "Sign in with a fingerprint."],
    say: "I'm a seller. I sign in with my fingerprint. No password, no wallet, no seed phrase. I pick a shop name, and I get one payment link for my bio." },
  "buyer-pay": { label: "THE BUYER", title: ["See the seller's record.", "Pay in naira, by card."],
    say: "Now I'm the buyer. Before I pay, I can see this seller's record. I enter the amount in naira, sign in with my fingerprint, and pay with my card." },
  lock: { label: "THE BUYER  ·  REAL TIME, UNCUT", title: ["Charged, then locked", "on Monad in about a second."],
    say: "The card is charged, and the money is locked on Monad. Secured in about one second. The network fee was about one naira, and VeriPay paid it. I never saw a wallet, a token, or a gas fee." },
  proof: { label: "PROOF, READ LIVE FROM MONAD", title: ["The money sits in", "a contract on Monad."],
    say: "This is the only place the blockchain shows. The money sits in a contract on Monad. The seller can't take it, and neither can we." },
  "seller-order": { label: "THE SELLER", title: ["The order appears.", "Time to deliver."],
    say: "The seller sees the order straight away, and delivers." },
  release: { label: "THE BUYER", title: ["It arrived.", "Confirm, and the seller is paid."],
    say: "When my order arrives, I confirm, and the seller is paid." },
  record: { label: "ANYONE CAN CHECK", title: ["A track record", "nobody can edit."],
    say: "The seller's record now shows one completed order. It is built from the chain, so nobody can edit it, including us. This only works because Monad confirms in a second and costs about a naira, so every order, even a small one, can be recorded." },
  chainlink: { label: "UNDER THE HOOD", title: ["Mera · Envio", "Chainlink · Alchemy"],
    say: "Fingerprint accounts use Mera. Seller records are indexed by Envio. And if a buyer goes silent, a Chainlink workflow pays the seller automatically. This is that transaction. All of this was built during Metropolis." },
  close: { label: "VERIPAY", title: ["Pay only when", "it arrives."],
    say: "This is a testnet version. No real money moves yet. Try it at veripay dot store." },
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });

let total = 0; const parts = [];
for (const [i, s] of scenes.entries()) {
  const m = META[s.id]; if (!m) continue;
  const n = String(i).padStart(2, "0"), bg = `vid/out/${n}-bg.png`, aud = `vid/out/${n}.aiff`, out = `vid/out/${n}-${s.id}.mp4`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0A0A0A"/>
    <rect x="${PX - 7}" y="${PY - 7}" width="${PW + 14}" height="${PH + 14}" rx="30" fill="#000" stroke="#3f3f46" stroke-width="2"/>
    <g transform="translate(590 78) scale(0.042)"><rect width="1024" height="1024" rx="236" fill="#fff"/><path d="M264 490 L444 728 L762 296" stroke="#0A0A0A" stroke-width="96" fill="none"/></g>
    <text x="646" y="110" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="28" fill="#fff">VeriPay</text>
    <text x="590" y="262" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="17" letter-spacing="3.5" fill="#a1a1aa">${esc(m.label)}</text>
    ${m.title.map((t, k) => `<text x="588" y="${326 + k * 58}" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="46" letter-spacing="-1" fill="#fff">${esc(t)}</text>`).join("")}
    <text x="590" y="640" font-family="Helvetica Neue, Helvetica, Arial" font-size="17" fill="#71717a">veripay.store   ·   Monad testnet   ·   test money, no real funds</text>
    <text x="590" y="668" font-family="Helvetica Neue, Helvetica, Arial" font-size="15" fill="#52525b">Automated run of the real app (local build, live testnet contracts). AI voice.</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(bg);
  execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aud, m.say]);
  const A = probe(aud), V = s.clips.reduce((x, c) => x + (c.b - c.a), 0), T = Math.max(V, A + 0.7);
  const ins = ["-loop", "1", "-framerate", "30", "-i", bg];
  for (const c of s.clips) ins.push("-ss", String(c.a), "-t", (c.b - c.a).toFixed(2), "-i", c.file);
  ins.push("-i", aud);
  const k = s.clips.length;
  const cat = k > 1 ? `${s.clips.map((_, j) => `[${j + 1}:v]`).join("")}concat=n=${k}:v=1:a=0[c];[c]` : "[1:v]";
  const filter = `${cat}fps=30,crop=390:844:0:0,scale=${PW}:${PH}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${Math.max(T - V, 0).toFixed(2)}[p];[0:v][p]overlay=${PX}:${PY}[v];[${k + 1}:a]adelay=350|350,apad[a]`;
  ff([...ins, "-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-t", T.toFixed(2), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k", out]);
  parts.push(out); total += T;
  console.log(`${s.id.padEnd(13)} video ${V.toFixed(1)}s  voice ${A.toFixed(1)}s  ->  ${T.toFixed(1)}s`);
}
fs.writeFileSync("vid/out/list.txt", parts.map((p) => `file '${p.replace("vid/out/", "")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", "vid/out/list.txt", "-c", "copy", "-movflags", "+faststart", "vid/veripay-demo.mp4"]);
console.log(`TOTAL ${total.toFixed(1)}s  (limit 180)  ->  vid/veripay-demo.mp4  ${(fs.statSync("vid/veripay-demo.mp4").size / 1e6).toFixed(1)} MB`);
