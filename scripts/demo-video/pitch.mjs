// Pitch video: title cards + the founder's photo + clips from the demo
// recording, narrated with macOS text-to-speech.
import fs from "fs"; import { execFileSync } from "child_process"; import { createRequire } from "module";
const sharp = createRequire(import.meta.url)("../node_modules/sharp");
const { scenes } = JSON.parse(fs.readFileSync("vid/scenes.json", "utf8"));
const clipOf = (id) => scenes.find((s) => s.id === id).clips[0];
import { narrate, subtitleFilter } from "./narr.mjs";
const SUB = { x: 98, y: 628, size: 25, max: 54, w: 740 };
const W = 1280, H = 720, PH = 600, PW = 278, PX = 900, PY = 60;
const F = 'font-family="Helvetica Neue, Helvetica, Arial"';
fs.mkdirSync("vid/pitch", { recursive: true });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const ff = (a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: ["ignore", "ignore", "inherit"] });
const logo = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect width="1024" height="1024" rx="236" fill="#fff"/><path d="M264 490 L444 728 L762 296" stroke="#0A0A0A" stroke-width="96" fill="none"/></g>`;
const head = `${logo(80, 56, 0.04)}<text x="134" y="86" ${F} font-weight="700" font-size="26" fill="#fff">VeriPay</text>`;
const foot = `<text x="80" y="672" ${F} font-size="15" fill="#52525b">Monad Metropolis  ·  Consumer Products &amp; Payments  ·  testnet, no real funds  ·  AI voice-over</text>`;
const label = (t, y = 190) => `<text x="80" y="${y}" ${F} font-weight="700" font-size="17" letter-spacing="3.5" fill="#a1a1aa">${esc(t)}</text>`;
const big = (lines, y = 252, size = 50) => lines.map((t, k) => `<text x="78" y="${y + k * (size + 12)}" ${F} font-weight="700" font-size="${size}" letter-spacing="-1" fill="#fff">${esc(t)}</text>`).join("");
// A line starting with ">" continues the bullet above it.
const bullets = (items, y) => items.map((t, k) => `${t.startsWith(">") ? "" : `<circle cx="88" cy="${y + k * 46 - 7}" r="4" fill="#fff"/>`}<text x="108" y="${y + k * 46}" ${F} font-size="25" fill="#d4d4d8">${esc(t.replace(/^>/, ""))}</text>`).join("");
const phoneFrame = `<rect x="${PX - 7}" y="${PY - 7}" width="${PW + 14}" height="${PH + 14}" rx="28" fill="#000" stroke="#3f3f46" stroke-width="2"/>`;

const SLIDES = [
  { id: "founder", photo: true,
    svg: `${head}${label("THE TEAM", 160)}${big(["Aje Emmanuel"], 232, 56)}<text x="80" y="276" ${F} font-size="24" fill="#a1a1aa">Founder, VeriPay  ·  Lagos, Nigeria</text>${bullets(["Full-stack blockchain developer, 5+ years", "Multiple hackathon winner", "Senior developer at two fintech companies", "BSc Computer Science", "Solo founder: a team of one"], 344)}`,
    say: "Meet Aje Emmanuel, the founder of VeriPay. Aje is a full stack blockchain developer with over five years of experience. He is a multiple hackathon winner, a computer science graduate, and has worked as a senior developer at two fintech companies. VeriPay is a team of one." },
  { id: "problem",
    svg: `${head}${label("THE PROBLEM")}${big(["Nobody wants to", "go first."])}${bullets(["Most online shopping in Nigeria happens on", ">Instagram, WhatsApp and Jiji, between strangers.", "Buyers lose money to sellers who vanish.", "Honest sellers lose sales because nobody trusts them."], 400)}`,
    say: "The problem is one every Nigerian knows. Most online shopping here happens on Instagram, WhatsApp and Jiji, between people who have never met. The seller says, pay first. The buyer says, deliver first. Buyers lose money to sellers who vanish, and honest sellers lose sales because nobody trusts them." },
  { id: "solution", clip: "lock",
    svg: `${head}${label("WHAT WE BUILT")}${big(["One link.", "Pay only when it arrives."])}${bullets(["Pay in naira, by card, with a fingerprint", "Money is held until the order arrives", "See the seller's real record before paying", "No wallet, no token, no gas fee"], 400)}${phoneFrame}`,
    say: "VeriPay fixes that with one link. The buyer pays in naira, by card, with a fingerprint. The money is held safely until the order arrives, and then the seller is paid. Before paying, the buyer can see the seller's real track record." },
  { id: "monad", clip: "record",
    svg: `${head}${label("WHY MONAD")}${big(["Fast and cheap enough", "to be invisible."])}${bullets(["A payment locks in about one second", "It costs about one naira, and we pay it", "So even a 2,000 naira order is worth protecting", "Every order builds a record nobody can edit"], 400)}${phoneFrame}`,
    say: "It runs on Monad, but the user never sees a wallet or a token. Monad locks a payment in about a second, for about one naira. So even a two thousand naira order is worth protecting, and every order adds to a public record that nobody can edit." },
  { id: "why",
    svg: `${head}${label("WHY WE ARE BUILDING IT")}${big(["Trust shouldn't cost", "ordinary people money."])}${bullets(["This gap costs buyers and sellers every day", "The technology is finally fast and cheap enough", ">to fix it without anyone noticing it's there"], 400)}`,
    say: "Why build it? Because this trust gap costs ordinary people money every day. After five years building blockchain and fintech products, Aje believes the technology is finally fast and cheap enough to fix it, without the user ever noticing it is there." },
  { id: "status",
    svg: `${head}${label("WHERE IT IS TODAY")}${big(["Working end to end", "on Monad testnet."])}${bullets(["Fingerprint sign-in, card payments, automatic payouts", ">and on-chain seller records all work today", "Next: security review, a licensed naira stablecoin", ">partner, and the first real sellers"], 400)}<text x="1200" y="86" text-anchor="end" ${F} font-weight="700" font-size="22" fill="#fff">veripay.store</text>`,
    say: "Today, VeriPay works end to end on Monad testnet, with test money. Fingerprint sign-in, card payments, automatic payouts and on-chain seller records all work. Next comes a security review, a licensed naira stablecoin partner, and the first real sellers. VeriPay. Pay only when it arrives." },
];

// Founder photo → circle
const D = 300;
const circle = await sharp("vid/founder.webp").resize(D, D, { fit: "cover", position: "top" })
  .composite([{ input: Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`), blend: "dest-in" }]).png().toBuffer();

let total = 0; const parts = [];
for (const [i, s] of SLIDES.entries()) {
  const n = String(i).padStart(2, "0"), bg = `vid/pitch/${n}.png`, out = `vid/pitch/${n}-${s.id}.mp4`;
  let img = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0A0A0A"/>${s.svg}${foot}${s.photo ? `<circle cx="1020" cy="330" r="${D / 2 + 5}" fill="none" stroke="#3f3f46" stroke-width="2"/>` : ""}</svg>`));
  if (s.photo) img = img.composite([{ input: circle, left: 1020 - D / 2, top: 330 - D / 2 }]);
  await img.png().toFile(bg);
  const voice = await narrate(s.say, `vid/pitch/${n}`, SUB, 0.4);
  const T = voice.duration + 0.9;
  const enc = ["-t", T.toFixed(2), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "160k", out];
  if (s.clip) {
    const c = clipOf(s.clip), V = c.b - c.a, subs = subtitleFilter(voice.cues, 3, "v0", T);
    ff(["-loop", "1", "-framerate", "30", "-i", bg, "-ss", String(c.a), "-t", V.toFixed(2), "-i", c.file, "-i", voice.audio, ...subs.inputs,
      "-filter_complex", `[1:v]fps=30,crop=390:844:0:0,scale=${PW}:${PH}:flags=lanczos,tpad=stop_mode=clone:stop_duration=${Math.max(T - V, 0).toFixed(2)}[p];[0:v][p]overlay=${PX}:${PY}[v0];${subs.steps};[2:a]apad[a]`,
      "-map", `[${subs.out}]`, "-map", "[a]", ...enc]);
  } else {
    const subs = subtitleFilter(voice.cues, 2, "v0", T);
    ff(["-loop", "1", "-framerate", "30", "-i", bg, "-i", voice.audio, ...subs.inputs,
      "-filter_complex", `[0:v]fps=30[v0];${subs.steps};[1:a]apad[a]`, "-map", `[${subs.out}]`, "-map", "[a]", ...enc]);
  }
  parts.push(out); total += T; console.log(`${s.id.padEnd(9)} ${T.toFixed(1)}s`);
}
fs.writeFileSync("vid/pitch/list.txt", parts.map((p) => `file '${p.replace("vid/pitch/", "")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", "vid/pitch/list.txt", "-c", "copy", "-movflags", "+faststart", "vid/veripay-pitch.mp4"]);
console.log(`TOTAL ${total.toFixed(1)}s (limit 120)`);
