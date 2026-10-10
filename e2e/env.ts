import path from 'path';

/** Test hedef adresleri (çalışan yerel yığın; bkz. playwright.config.ts). */
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const ADMIN_URL = process.env.E2E_ADMIN_URL || 'http://localhost:3001';
export const API_URL = process.env.E2E_API_URL || 'http://localhost:5001/api';
/** Hızlı girişle alınan demo oturumu (çerezler); auth.setup.ts yazar, .gitignore'da */
export const AUTH_FILE = path.join(__dirname, '.auth', 'demo.json');
/** Yerel tohum verisindeki demo yönetici hesabı (backend/src/dev/seed.ts) */
export const DEMO_EMAIL = 'demo@portfoygo.local';
