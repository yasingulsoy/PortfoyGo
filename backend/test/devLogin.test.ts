import { afterEach, describe, expect, it } from 'vitest';
import { isDevLoginEnabled } from '../src/routes/devLogin';

// Hızlı giriş YALNIZCA yerel veritabanında ve production dışında açık olmalı.
describe('isDevLoginEnabled', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const set = (env: Record<string, string | undefined>) => {
    for (const k of ['NODE_ENV', 'DEV_LOGIN', 'DATABASE_URL', 'DB_HOST']) delete process.env[k];
    Object.assign(process.env, env);
  };

  it('yerel PGlite veritabanında açık', () => {
    set({ NODE_ENV: 'development', DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:54329/postgres' });
    expect(isDevLoginEnabled()).toBe(true);
  });

  it('uzak veritabanında kapalı', () => {
    set({ NODE_ENV: 'development', DATABASE_URL: 'postgres://u:p@31.97.179.210:25432/db' });
    expect(isDevLoginEnabled()).toBe(false);
    set({ NODE_ENV: 'development', DB_HOST: 'db.example.com' });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it('production ortamında yerel DB olsa bile kapalı', () => {
    set({ NODE_ENV: 'production', DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres' });
    expect(isDevLoginEnabled()).toBe(false);
  });

  it('DEV_LOGIN=0 ile açıkça kapatılabilir; bozuk URL kapalı sayılır', () => {
    set({ NODE_ENV: 'development', DEV_LOGIN: '0', DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:54329/postgres' });
    expect(isDevLoginEnabled()).toBe(false);
    set({ NODE_ENV: 'development', DATABASE_URL: 'bozuk-url' });
    expect(isDevLoginEnabled()).toBe(false);
  });
});
