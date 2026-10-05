import fs from "fs"; import sharp from "sharp";
const sq = (bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${bg}"/><path d="M264 490 L444 728 L762 296" stroke="${fg}" stroke-width="96" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" fill="none"/></svg>`;
for (const [n, svg] of [["veripay-square-black", sq("#0A0A0A", "#FFFFFF")], ["veripay-square-white", sq("#FFFFFF", "#0A0A0A")]]) {
  fs.writeFileSync(n + ".svg", svg);
  await sharp(Buffer.from(svg), { density: 72 }).flatten({ background: "#0A0A0A" }).png().toFile(n + ".png");
  const m = await sharp(n + ".png").metadata(); console.log(n, m.width, m.height, m.hasAlpha, fs.statSync(n + ".png").size);
}
