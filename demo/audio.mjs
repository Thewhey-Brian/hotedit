// Voice-over, sound effects and music for the tour (ElevenLabs).
//   node demo/audio.mjs            → demo/.media/{voice,sfx,music}/*.mp3 + durations.json
//   add --force to regenerate what exists
// Needs ELEVENLABS_API_KEY in the environment, or in a file named by
// ENV_FILE=… in demo/.env (both git-ignored). The key is never printed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const here = import.meta.dirname;
const media = path.join(here, ".media");
const loadEnv = (f) => {
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
loadEnv(path.join(here, ".env"));
if (process.env.ENV_FILE) loadEnv(process.env.ENV_FILE);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY is not set (environment, or ENV_FILE in demo/.env).");
  process.exit(1);
}
const force = process.argv.includes("--force");
const { voice, scenes } = JSON.parse(fs.readFileSync(path.join(here, "narration.json"), "utf8"));

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}
const secs = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim());

for (const d of ["voice", "sfx", "music"]) fs.mkdirSync(path.join(media, d), { recursive: true });

const durations = {};
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const out = path.join(media, "voice", `${s.id}.mp3`);
  if (force || !fs.existsSync(out)) {
    const buf = await post(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      text: s.text,
      model_id: "eleven_multilingual_v2",
      previous_text: scenes[i - 1] && scenes[i - 1].text,
      next_text: scenes[i + 1] && scenes[i + 1].text,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.05 },
    });
    fs.writeFileSync(out, buf);
    console.log("voice", s.id);
  }
  durations[s.id] = secs(out);
}
fs.writeFileSync(path.join(media, "durations.json"), JSON.stringify(durations, null, 2));

const SFX = {
  whoosh: ["Soft, airy cinematic whoosh for a scene transition, gentle and clean, no impact", 1.2],
  tap: ["Subtle soft UI tap, a clean glassy mouse click", 0.5],
  pop: ["Soft satisfying confirmation pop, warm and rounded", 0.6],
  shimmer: ["Gentle magical shimmer, soft sparkle reveal, airy", 1.6],
  typing: ["Soft crisp laptop keyboard typing, a few quiet keystrokes", 1.5],
};
for (const [name, [text, duration_seconds]] of Object.entries(SFX)) {
  const out = path.join(media, "sfx", `${name}.mp3`);
  if (!force && fs.existsSync(out)) continue;
  fs.writeFileSync(out, await post("https://api.elevenlabs.io/v1/sound-generation", { text, duration_seconds, prompt_influence: 0.65 }));
  console.log("sfx", name);
}

const total = Object.values(durations).reduce((a, b) => a + b, 0);
const bed = path.join(media, "music", "bed.mp3");
if (force || !fs.existsSync(bed)) {
  const ms = Math.min(300000, Math.round((total * 1.6 + 30) * 1000));
  fs.writeFileSync(
    bed,
    await post("https://api.elevenlabs.io/v1/music", {
      prompt:
        "Elegant, warm, modern instrumental for a developer tool product film. Soft felt piano, airy pads, a light " +
        "gentle pulse of minimal percussion, optimistic, focused and calm, spacious, no vocals. Steady throughout, " +
        "ends with a soft resolved chord.",
      music_length_ms: ms,
    }),
  );
  console.log("music bed", (ms / 1000).toFixed(0), "s");
}
console.log(`narration ${total.toFixed(1)} s over ${scenes.length} scenes`);
