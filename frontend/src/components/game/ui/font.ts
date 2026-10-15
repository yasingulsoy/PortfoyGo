import { Baloo_2 } from 'next/font/google';

/** Oyun alanının kalın, yuvarlak yazı tipi (Türkçe karakterler için latin-ext). CSS değişkeni: --font-game */
export const gameFont = Baloo_2({ subsets: ['latin', 'latin-ext'], variable: '--font-game', display: 'swap' });
