import pool from '../config/database';
import fs from 'fs';
import path from 'path';

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'addCurrencyAssetType.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Currency asset_type migration tamamlandı');
  } catch (e: any) {
    if (e.message?.includes('does not exist')) {
      console.log('⚠️ Constraint zaten değiştirilmiş veya mevcut değil');
    } else {
      console.error('Hata:', e.message);
    }
  } finally {
    await pool.end();
  }
}
run();
