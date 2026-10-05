import fs from "fs"; import sharp from "sharp";
const check = (c) => `<path d="M264 490 L444 728 L762 296" stroke="${c}" stroke-width="96" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" fill="none"/>`;
const mark = (bg, fg, canvas) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${canvas ? `<rect width="1024" height="1024" fill="${canvas}"/>` : ""}<g transform="translate(112 112) scale(0.78125)"><rect width="1024" height="1024" rx="236" fill="${bg}"/>${check(fg)}</g></svg>`;
const icon = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="236" fill="${bg}"/>${check(fg)}</svg>`;
const lockup = (canvas, bg, fg, text) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 1200"><rect width="2400" height="1200" fill="${canvas}"/><g transform="translate(560 440) scale(0.3125)"><rect width="1024" height="1024" rx="236" fill="${bg}"/>${check(fg)}</g><text x="970" y="682" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="250" letter-spacing="-9" fill="${text}">VeriPay</text></svg>`;
const files = {
  "veripay-icon": icon("#0A0A0A", "#FFFFFF"),
  "veripay-icon-white": icon("#FFFFFF", "#0A0A0A"),
  "veripay-mark-on-white": mark("#0A0A0A", "#FFFFFF", "#FFFFFF"),
  "veripay-mark-on-black": mark("#FFFFFF", "#0A0A0A", "#0A0A0A"),
  "veripay-logo-on-white": lockup("#FFFFFF", "#0A0A0A", "#FFFFFF", "#0A0A0A"),
  "veripay-logo-on-black": lockup("#0A0A0A", "#FFFFFF", "#0A0A0A", "#FFFFFF"),
};
for (const [n, svg] of Object.entries(files)) { fs.writeFileSync(n + ".svg", svg); await sharp(Buffer.from(svg), { density: 72 }).png().toFile(n + ".png"); }
await sharp({ create: { width: 2400, height: 2400, channels: 3, background: "#fff" } }).composite([{ input: "veripay-logo-on-white.png", top: 0, left: 0 }, { input: "veripay-logo-on-black.png", top: 1200, left: 0 }]).png().toFile("_preview.png");
