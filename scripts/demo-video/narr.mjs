// Narration + subtitles. Each sentence is synthesised on its own so we know
// exactly when it starts and ends; subtitles are cut from those timings.
import fs from "fs"; import { execFileSync } from "child_process"; import { createRequire } from "module";
const sharp = createRequire(import.meta.url)("../node_modules/sharp");
export const VOICE = process.env.VOICE || "Serena (Premium)", RATE = process.env.RATE || "170";
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const ff = (a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: ["ignore", "ignore", "inherit"] });
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Break a sentence into subtitle lines of at most `max` characters. */
function lines(sentence, max) {
  const out = []; let cur = "";
  for (const w of sentence.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  // Avoid a one-word orphan at the end.
  if (out.length > 1 && out[out.length - 1].split(" ").length === 1) { const last = out.pop(); const prev = out.pop().split(" "); const moved = prev.pop(); out.push(prev.join(" ")); out.push(moved + " " + last); }
  return out;
}

/**
 * @returns {{ audio: string, duration: number, cues: {file: string, a: number, b: number}[] }}
 * `sub` = { x, y, size, max, w } — where and how big the subtitle is drawn on a 1280x720 frame.
 */
export async function narrate(text, base, sub, lead = 0.35) {
  const sentences = text.match(/[^.!?]+[.!?]+/g).map((s) => s.trim());
  const files = []; const cues = []; let t = lead;
  for (const [i, s] of sentences.entries()) {
    const f = `${base}-s${i}.aiff`;
    execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", f, s]);
    const d = probe(f); files.push(f);
    const ls = lines(s, sub.max); const chars = ls.reduce((n, l) => n + l.length, 0);
    let u = t;
    for (const l of ls) { const span = d * (l.length / chars); cues.push({ text: l, a: u, b: u + span }); u += span; }
    t += d;
  }
  // Hold each subtitle until the next one starts, so it never flickers off mid-thought.
  for (let i = 0; i < cues.length - 1; i++) cues[i].b = cues[i + 1].a;
  cues[cues.length - 1].b += 0.5;
  const audio = `${base}.wav`;
  ff([...files.flatMap((f) => ["-i", f]), "-filter_complex", `${files.map((_, i) => `[${i}:a]`).join("")}concat=n=${files.length}:v=0:a=1,adelay=${Math.round(lead * 1000)}|${Math.round(lead * 1000)}[a]`, "-map", "[a]", "-ar", "44100", "-ac", "2", audio]);
  for (const [i, c] of cues.entries()) {
    c.file = `${base}-c${i}.png`;
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <rect x="${sub.x - 18}" y="${sub.y - sub.size - 12}" width="${sub.w}" height="${sub.size + 34}" rx="12" fill="#18181b" stroke="#27272a"/>
      <text x="${sub.x}" y="${sub.y}" font-family="Helvetica Neue, Helvetica, Arial" font-weight="500" font-size="${sub.size}" fill="#fafafa">${esc(c.text)}</text></svg>`)).png().toFile(c.file);
  }
  return { audio, duration: t, cues };
}

/** ffmpeg inputs + filter steps that draw the cues over the video stream `inLabel`. */
export function subtitleFilter(cues, firstIndex, inLabel, total) {
  const inputs = cues.flatMap((c) => ["-loop", "1", "-framerate", "30", "-t", total.toFixed(2), "-i", c.file]);
  let prev = inLabel; const steps = [];
  cues.forEach((c, i) => { const next = `s${i}`; steps.push(`[${prev}][${firstIndex + i}:v]overlay=0:0:enable='between(t,${c.a.toFixed(2)},${c.b.toFixed(2)})'[${next}]`); prev = next; });
  return { inputs, steps: steps.join(";"), out: prev };
}
