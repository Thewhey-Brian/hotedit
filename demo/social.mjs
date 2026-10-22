// Short social cut of the tour: new voice lines (demo/social.json) over spans of
// demo/hotedit-tour.mp4, each span sped up to fit its line (at most 2.5×),
// cropped to 16:9 (which also drops the tour's numbered captions).
//   node demo/audio.mjs demo/social.json && node demo/social.mjs → demo/hotedit-social.mp4
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const here = import.meta.dirname;
const media = path.join(here, ".media");
const { scenes } = JSON.parse(fs.readFileSync(path.join(here, "social.json"), "utf8"));
const dur = JSON.parse(fs.readFileSync(path.join(media, "durations-social.json"), "utf8"));
const LEAD = 0.25, TAIL = 0.45, END_HOLD = 1.2;

let at = 0;
const parts = scenes.map((s, i) => {
  const span = s.to - s.from;
  let slot = Math.max(dur[s.id] + LEAD + TAIL, span / 2.5);
  if (i === scenes.length - 1) slot += END_HOLD;
  const p = { ...s, slot, speed: span / slot, at };
  at += slot;
  return p;
});

const v = parts
  .map((p, i) => `[0:v]trim=${p.from}:${p.to},setpts=(PTS-STARTPTS)/${p.speed.toFixed(4)},fps=30,trim=0:${p.slot.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`)
  .join(";");
const inputs = ["-i", path.join(here, "hotedit-tour.mp4")];
const a = [];
parts.forEach((p, i) => {
  inputs.push("-i", path.join(media, "voice-social", `${p.id}.mp3`));
  a.push(`[${i + 1}:a]adelay=${Math.round((p.at + LEAD) * 1000)}:all=1[vo${i}]`);
});
const n = parts.length;
inputs.push("-i", path.join(media, "music", "bed.mp3"), "-i", path.join(media, "sfx", "whoosh.mp3"));
const total = at;
const filter = [
  v,
  `${parts.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0,crop=1280:720:0:0,fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6[vout]`,
  ...a,
  `${parts.map((_, i) => `[vo${i}]`).join("")}amix=inputs=${n}:normalize=0,apad[voice]`,
  `[voice]asplit[vk][vm]`,
  `[${n + 1}:a]atrim=0:${total.toFixed(2)},volume=0.32,afade=t=in:d=0.8,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[bed]`,
  `[bed][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]`,
  `[${n + 2}:a]asplit=${n - 1}${parts.slice(1).map((_, i) => `[w${i}]`).join("")}`,
  ...parts.slice(1).map((p, i) => `[w${i}]volume=0.45,adelay=${Math.max(0, Math.round((p.at - 0.35) * 1000))}:all=1[wd${i}]`),
  `[vm][duck]${parts.slice(1).map((_, i) => `[wd${i}]`).join("")}amix=inputs=${n + 1}:normalize=0,atrim=0:${total.toFixed(2)},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
].join(";");
const out = path.join(here, "hotedit-social.mp4");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], { stdio: "inherit" });
for (const p of parts) console.log(`${p.id.padEnd(8)} at ${p.at.toFixed(1)} s  ${p.slot.toFixed(1)} s  ×${p.speed.toFixed(2)}`);
console.log(`${out}: ${total.toFixed(1)} s`);
