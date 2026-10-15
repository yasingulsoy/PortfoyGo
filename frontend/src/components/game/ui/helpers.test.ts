import { describe, expect, it } from 'vitest';
import { AVATAR_IDS, avatarIndex, compactCoins, frameStyle, hashString, normalizeAvatarId, tierTone } from './helpers';

describe('avatar id mapping', () => {
  it('accepts the contract ids and common variants', () => {
    expect(AVATAR_IDS).toHaveLength(12);
    expect(avatarIndex('avatar-1')).toBe(1);
    expect(avatarIndex('avatar-12')).toBe(12);
    expect(avatarIndex('avatar_7')).toBe(7);
    expect(avatarIndex('AVATAR3')).toBe(3);
    expect(avatarIndex(' 5 ')).toBe(5);
    expect(avatarIndex(9)).toBe(9);
  });

  it('falls back to a stable seed-based avatar for unknown ids', () => {
    expect(avatarIndex('avatar-13')).toBe(1);
    expect(avatarIndex(null)).toBe(1);
    const a = avatarIndex('unknown', 'demo');
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(12);
    expect(avatarIndex(undefined, 'demo')).toBe(a);
    expect(avatarIndex('avatar-0', 'demo')).toBe(a);
    expect(normalizeAvatarId('avatar_4')).toBe('avatar-4');
    expect(normalizeAvatarId(undefined, 'demo')).toBe(`avatar-${a}`);
  });

  it('hashes deterministically', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('frame and tier mapping', () => {
  it('maps frame ids to styles', () => {
    expect(frameStyle('frame-gold')).toBe('gold');
    expect(frameStyle('frame_diamond_ring')).toBe('diamond');
    expect(frameStyle('neon')).toBe('neon');
    expect(frameStyle('wheel-frame')).toBe('wheel');
    expect(frameStyle('çark-çerçevesi')).toBe('wheel');
    expect(frameStyle('platinum')).toBe('platinum');
    expect(frameStyle('frame-plain')).toBeNull();
    expect(frameStyle('')).toBeNull();
    expect(frameStyle(null)).toBeNull();
  });

  it('maps tiers to tones', () => {
    expect(tierTone({ id: 'gold', label: 'Altın' })).toBe('gold');
    expect(tierTone('Gümüş')).toBe('silver');
    expect(tierTone({ id: 'diamond' })).toBe('diamond');
    expect(tierTone({ label: 'Usta' })).toBe('master');
    expect(tierTone('bronze')).toBe('bronze');
    expect(tierTone(null)).toBe('rookie');
  });

  it('shortens big coin amounts', () => {
    expect(compactCoins(1250)).toBe('1.250');
    expect(compactCoins(12_400)).toBe('12,4B');
    expect(compactCoins(1_200_000)).toBe('1,2M');
  });
});
