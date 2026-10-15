'use client';

import { useCallback } from 'react';
import { useLocalStorage, writeLocal } from '@/hooks/useLocalStorage';

/**
 * İsteğe bağlı, sentezlenmiş kısa oyun sesleri (WebAudio). Varsayılan KAPALI; tercih localStorage'da tutulur.
 * Ses dosyası indirilmez; her ses birkaç osilatör notasından oluşur.
 */
export const SOUND_KEY = 'pg:game-sound';

export type GameSound = 'tap' | 'coin' | 'win' | 'lose' | 'tick' | 'go' | 'buy' | 'sell' | 'pop' | 'match';

/** [frekans Hz, başlangıç s, süre s, dalga] */
type Note = [number, number, number, OscillatorType];

const SOUNDS: Record<GameSound, Note[]> = {
  tap: [[660, 0, 0.05, 'triangle']],
  pop: [[520, 0, 0.06, 'sine'], [880, 0.04, 0.07, 'sine']],
  coin: [[988, 0, 0.07, 'square'], [1319, 0.07, 0.16, 'square']],
  tick: [[440, 0, 0.08, 'triangle']],
  go: [[523, 0, 0.09, 'triangle'], [784, 0.08, 0.2, 'triangle']],
  buy: [[587, 0, 0.06, 'triangle'], [880, 0.05, 0.09, 'triangle']],
  sell: [[880, 0, 0.06, 'triangle'], [587, 0.05, 0.09, 'triangle']],
  match: [[392, 0, 0.08, 'triangle'], [523, 0.08, 0.08, 'triangle'], [659, 0.16, 0.14, 'triangle']],
  win: [[523, 0, 0.1, 'triangle'], [659, 0.1, 0.1, 'triangle'], [784, 0.2, 0.1, 'triangle'], [1047, 0.3, 0.3, 'triangle']],
  lose: [[392, 0, 0.14, 'sine'], [330, 0.14, 0.24, 'sine']],
};

let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

/** Sesi çalar (ses kapalıysa hiçbir şey yapmaz). Kullanıcı etkileşimiyle tetiklenmelidir. */
export function playSound(name: GameSound, force = false) {
  if (typeof window === 'undefined' || (!force && !soundEnabled())) return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, start, dur, type] of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + start);
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch {
    // ses kullanılamıyor — sessizce geç
  }
}

export function useGameSound() {
  const [value] = useLocalStorage(SOUND_KEY);
  const enabled = value === '1';
  const setEnabled = useCallback((on: boolean) => {
    writeLocal(SOUND_KEY, on ? '1' : null);
    if (on) playSound('pop', true);
  }, []);
  return { enabled, setEnabled, play: playSound };
}
