// Oyun arayüz kiti (Kafa Topu tarzı). Yalnızca [data-skin="game"] altında (oyun düzeni) kullanılmalı:
// renkler app/oyun/game.css'teki --g-* token'larından gelir.

export { default as GameScreen, type GameBackground } from './GameScreen';
export { default as GameTopBar } from './GameTopBar';
export { default as GameButton, GameLinkButton, GameSpinner, gameButtonClass, type GameButtonProps, type GameButtonSize, type GameButtonVariant } from './GameButton';
export { default as GamePanel, type GameAccent } from './GamePanel';
export { default as ModeTile } from './ModeTile';
export { CoinCounter, HudCounter, RatingCounter } from './CoinCounter';
export { default as XpBar } from './XpBar';
export { default as TierBadge } from './TierBadge';
export { default as Avatar, avatarName, frameName, type AvatarProps, type AvatarSize } from './Avatar';
export { default as RewardPopup, type RewardItem, type RewardKind } from './RewardPopup';
export { default as Confetti } from './Confetti';
export { default as CountdownOverlay } from './CountdownOverlay';
export { default as VsScreen, BOT_LABEL, type VsPlayer } from './VsScreen';
export { default as GameDialog } from './GameDialog';
export { BackButton, GameLoader, GameNotice, LevelAvatar, SoundToggle } from './bits';
export { CoinIcon, FlameIcon, GemIcon, GiftIcon, ShieldIcon, StarIcon, TrophyIcon, WheelIcon } from './icons';
export { playSound, soundEnabled, useGameSound, type GameSound } from './sound';
export { useReducedMotion } from './hooks';
export {
  AVATAR_COUNT,
  AVATAR_IDS,
  AVATAR_NAMES,
  AVATAR_RARITY,
  FRAME_NAMES,
  FRAME_STYLES,
  TIER_LABELS,
  avatarIndex,
  compactCoins,
  frameStyle,
  normalizeAvatarId,
  tierTone,
  type FrameStyle,
  type TierTone,
} from './helpers';
