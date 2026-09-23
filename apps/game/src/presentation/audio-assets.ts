/// <reference types="vite/client" />

const audioFiles = import.meta.glob(
  [
    "../../../../assets/library/audio/runtime/*.ogg",
    "../../../../assets/library/audio/runtime/*.mp3",
  ],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const audioByFilename = new Map(
  Object.entries(audioFiles).map(([path, url]) => [path.split("/").at(-1), url]),
);

function audioAsset(filename: string): string {
  const url = audioByFilename.get(filename);
  if (!url) {
    throw new Error(`Missing controlled audio asset: ${filename}`);
  }
  return url;
}

export const AUDIO_ASSETS = {
  "ambience-forest": audioAsset("ambience-forest.mp3"),
  "base-hit": audioAsset("base-hit.ogg"),
  build: audioAsset("build.ogg"),
  coin: audioAsset("coin.ogg"),
  defeat: audioAsset("defeat.ogg"),
  "music-battle": audioAsset("music-battle.ogg"),
  "music-lobby": audioAsset("music-lobby.ogg"),
  "tower-aoe": audioAsset("tower-aoe.ogg"),
  "tower-basic": audioAsset("tower-basic.ogg"),
  "tower-heavy": audioAsset("tower-heavy.ogg"),
  "tower-slow": audioAsset("tower-slow.ogg"),
  "ui-click": audioAsset("ui-click.ogg"),
  "ui-close": audioAsset("ui-close.ogg"),
  "ui-confirm": audioAsset("ui-confirm.ogg"),
  "ui-error": audioAsset("ui-error.ogg"),
  "ui-open": audioAsset("ui-open.ogg"),
  "ui-select": audioAsset("ui-select.ogg"),
  victory: audioAsset("victory.ogg"),
  "wave-start": audioAsset("wave-start.ogg"),
} as const;

export type AudioCueId = keyof typeof AUDIO_ASSETS;

export const AUDIO_CUE_META: Record<AudioCueId, { bus: "music" | "effects"; priority: number; cooldownMs: number; volume: number; intense?: boolean }> = {
  "ambience-forest": { bus: "music", priority: 0, cooldownMs: 0, volume: 0.18 },
  "base-hit": { bus: "effects", priority: 10, cooldownMs: 180, volume: 0.9, intense: true },
  build: { bus: "effects", priority: 7, cooldownMs: 80, volume: 0.68 },
  coin: { bus: "effects", priority: 3, cooldownMs: 100, volume: 0.38 },
  defeat: { bus: "effects", priority: 10, cooldownMs: 800, volume: 0.8, intense: true },
  "music-battle": { bus: "music", priority: 0, cooldownMs: 0, volume: 0.3 },
  "music-lobby": { bus: "music", priority: 0, cooldownMs: 0, volume: 0.28 },
  "tower-aoe": { bus: "effects", priority: 5, cooldownMs: 120, volume: 0.42, intense: true },
  "tower-basic": { bus: "effects", priority: 2, cooldownMs: 75, volume: 0.26 },
  "tower-heavy": { bus: "effects", priority: 6, cooldownMs: 180, volume: 0.52, intense: true },
  "tower-slow": { bus: "effects", priority: 4, cooldownMs: 110, volume: 0.34 },
  "ui-click": { bus: "effects", priority: 5, cooldownMs: 35, volume: 0.3 },
  "ui-close": { bus: "effects", priority: 5, cooldownMs: 60, volume: 0.35 },
  "ui-confirm": { bus: "effects", priority: 7, cooldownMs: 80, volume: 0.5 },
  "ui-error": { bus: "effects", priority: 8, cooldownMs: 140, volume: 0.5 },
  "ui-open": { bus: "effects", priority: 5, cooldownMs: 60, volume: 0.35 },
  "ui-select": { bus: "effects", priority: 5, cooldownMs: 50, volume: 0.3 },
  victory: { bus: "effects", priority: 10, cooldownMs: 800, volume: 0.76 },
  "wave-start": { bus: "effects", priority: 9, cooldownMs: 500, volume: 0.7 },
};
