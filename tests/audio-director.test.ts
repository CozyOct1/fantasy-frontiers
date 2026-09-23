import { describe, expect, it } from "vitest";
import { AUDIO_ASSETS, AUDIO_CUE_META } from "../apps/game/src/presentation/audio-assets.js";
import { effectiveCueVolume, type AudioPreferences } from "../apps/game/src/presentation/audio-director.js";

const preferences: AudioPreferences = { masterVolume: 80, musicVolume: 50, effectsVolume: 100, muted: false, reduceIntenseAudio: false };

describe("V6 audio contracts", () => {
  it("keeps every cue local, configured, and assigned to a bus", () => {
    expect(Object.keys(AUDIO_ASSETS).sort()).toEqual(Object.keys(AUDIO_CUE_META).sort());
    expect(Object.values(AUDIO_ASSETS).every(url => !/^https?:/i.test(url))).toBe(true);
  });

  it("applies master/bus volume, mute, and intense-audio comfort independently", () => {
    expect(effectiveCueVolume("ui-click", preferences)).toBeCloseTo(0.8 * 1 * AUDIO_CUE_META["ui-click"].volume);
    expect(effectiveCueVolume("music-lobby", preferences)).toBeCloseTo(0.8 * 0.5 * AUDIO_CUE_META["music-lobby"].volume);
    expect(effectiveCueVolume("base-hit", { ...preferences, reduceIntenseAudio: true })).toBeCloseTo(effectiveCueVolume("base-hit", preferences) * 0.55);
    expect(effectiveCueVolume("base-hit", { ...preferences, muted: true })).toBe(0);
  });
});
