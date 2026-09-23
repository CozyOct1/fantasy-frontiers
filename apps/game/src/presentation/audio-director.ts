import { AUDIO_ASSETS, AUDIO_CUE_META, type AudioCueId } from "./audio-assets";

export interface AudioPreferences {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  reduceIntenseAudio: boolean;
}

export type AudioScene = "lobby" | "deployment" | "battle" | "result";

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value / 100));

export function effectiveCueVolume(cue: AudioCueId, preferences: AudioPreferences): number {
  if (preferences.muted) return 0;
  const meta = AUDIO_CUE_META[cue];
  const bus = meta.bus === "music" ? preferences.musicVolume : preferences.effectsVolume;
  const comfort = preferences.reduceIntenseAudio && meta.intense ? 0.55 : 1;
  return clampVolume(preferences.masterVolume) * clampVolume(bus) * meta.volume * comfort;
}

/** Browser-owned presentation audio. It never feeds state back into Game Core. */
export class AudioDirector {
  private context?: AudioContext;
  private preferences: AudioPreferences;
  private readonly buffers = new Map<AudioCueId, Promise<AudioBuffer | null>>();
  private readonly lastPlayed = new Map<AudioCueId, number>();
  private activeVoices: Array<{ source: AudioBufferSourceNode; priority: number; startedAt: number }> = [];
  private desiredScene: AudioScene = "lobby";
  private music?: { cue: AudioCueId; source: AudioBufferSourceNode; gain: GainNode };
  private ambience?: { source: AudioBufferSourceNode; gain: GainNode };
  private unlocked = false;
  private readonly voiceLimit: number;

  constructor(preferences: AudioPreferences, voiceLimit = 24) {
    this.preferences = preferences;
    this.voiceLimit = voiceLimit;
  }

  get isUnlocked(): boolean { return this.unlocked; }

  updatePreferences(preferences: AudioPreferences): void {
    this.preferences = preferences;
    if (this.music) this.music.gain.gain.setTargetAtTime(effectiveCueVolume(this.music.cue, preferences), this.context?.currentTime ?? 0, 0.04);
    if (this.ambience) this.ambience.gain.gain.setTargetAtTime(effectiveCueVolume("ambience-forest", preferences), this.context?.currentTime ?? 0, 0.04);
  }

  async unlock(): Promise<boolean> {
    if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return false;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      await this.context.resume();
      this.unlocked = this.context.state === "running";
      if (this.unlocked) {
        void this.preloadCore();
        void this.applyScene();
      }
      return this.unlocked;
    } catch { return false; }
  }

  async setSuspended(suspended: boolean): Promise<void> {
    if (!this.context) return;
    try {
      if (suspended && this.context.state === "running") await this.context.suspend();
      else if (!suspended && this.unlocked && this.context.state === "suspended") await this.context.resume();
    } catch { /* The browser remains authoritative over AudioContext lifecycle. */ }
  }

  setScene(scene: AudioScene): void {
    if (this.desiredScene === scene) return;
    this.desiredScene = scene;
    if (this.unlocked) void this.applyScene();
  }

  async play(cue: AudioCueId, playbackRate = 1): Promise<boolean> {
    const context = this.context;
    if (!this.unlocked || !context || context.state !== "running" || effectiveCueVolume(cue, this.preferences) <= 0) return false;
    const meta = AUDIO_CUE_META[cue];
    const now = performance.now();
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < meta.cooldownMs) return false;
    const buffer = await this.load(cue);
    if (!buffer || context.state !== "running") return false;
    this.lastPlayed.set(cue, now);
    this.trimVoices(meta.priority);
    if (this.activeVoices.length >= this.voiceLimit) return false;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = effectiveCueVolume(cue, this.preferences);
    source.connect(gain).connect(context.destination);
    const voice = { source, priority: meta.priority, startedAt: now };
    this.activeVoices.push(voice);
    source.onended = () => { this.activeVoices = this.activeVoices.filter(candidate => candidate !== voice); };
    source.start();
    return true;
  }

  duckMusic(durationMs = 450): void {
    if (!this.music || !this.context) return;
    const now = this.context.currentTime;
    const normal = effectiveCueVolume(this.music.cue, this.preferences);
    this.music.gain.gain.cancelScheduledValues(now);
    this.music.gain.gain.setTargetAtTime(normal * 0.35, now, 0.025);
    this.music.gain.gain.setTargetAtTime(normal, now + durationMs / 1000, 0.12);
  }

  destroy(): void {
    this.stopMusic();
    this.stopAmbience();
    for (const voice of this.activeVoices) try { voice.source.stop(); } catch { /* already stopped */ }
    this.activeVoices = [];
    void this.context?.close();
    this.context = undefined;
    this.unlocked = false;
  }

  private async preloadCore(): Promise<void> {
    await Promise.all((["ui-click", "ui-confirm", "ui-error", "build", "wave-start", "base-hit", "victory", "defeat"] as AudioCueId[]).map(cue => this.load(cue)));
  }

  private load(cue: AudioCueId): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(cue);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const response = await fetch(AUDIO_ASSETS[cue]);
        if (!response.ok || !this.context) return null;
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch { return null; }
    })();
    this.buffers.set(cue, promise);
    return promise;
  }

  private async applyScene(): Promise<void> {
    const musicCue: AudioCueId = this.desiredScene === "battle" ? "music-battle" : "music-lobby";
    if (this.music?.cue !== musicCue) await this.startMusic(musicCue);
    if (!this.ambience && this.desiredScene !== "battle") await this.startAmbience();
    if (this.desiredScene === "battle") this.stopAmbience();
  }

  private async startMusic(cue: AudioCueId): Promise<void> {
    const context = this.context;
    if (!context) return;
    const buffer = await this.load(cue);
    if (!buffer || (this.desiredScene === "battle" ? "music-battle" : "music-lobby") !== cue) return;
    this.stopMusic();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.value = 0;
    source.connect(gain).connect(context.destination);
    source.start();
    gain.gain.setTargetAtTime(effectiveCueVolume(cue, this.preferences), context.currentTime, 0.25);
    this.music = { cue, source, gain };
  }

  private async startAmbience(): Promise<void> {
    const context = this.context;
    if (!context) return;
    const buffer = await this.load("ambience-forest");
    if (!buffer || this.desiredScene === "battle" || this.ambience) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer; source.loop = true;
    gain.gain.value = effectiveCueVolume("ambience-forest", this.preferences);
    source.connect(gain).connect(context.destination); source.start();
    this.ambience = { source, gain };
  }

  private stopMusic(): void {
    if (!this.music) return;
    try { this.music.source.stop(); } catch { /* already stopped */ }
    this.music = undefined;
  }

  private stopAmbience(): void {
    if (!this.ambience) return;
    try { this.ambience.source.stop(); } catch { /* already stopped */ }
    this.ambience = undefined;
  }

  private trimVoices(incomingPriority: number): void {
    if (this.activeVoices.length < this.voiceLimit) return;
    const candidate = [...this.activeVoices].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
    if (!candidate || candidate.priority > incomingPriority) return;
    try { candidate.source.stop(); } catch { /* already stopped */ }
    this.activeVoices = this.activeVoices.filter(voice => voice !== candidate);
  }
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}
