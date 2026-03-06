import pool from '../config/database';

async function createAllTables() {
  try {
    console.log('🔧 PostgreSQL tabloları oluşturuluyor...\n');

    // 1. Users tablosu
    console.log('📋 Users tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_code VARCHAR(6),
        verification_code_expires_at TIMESTAMP,
        balance DECIMAL(15,2) DEFAULT 100000.00,
        portfolio_value DECIMAL(15,2) DEFAULT 0.00,
        total_profit_loss DECIMAL(15,2) DEFAULT 0.00,
        rank INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);
    console.log('✅ Users tablosu oluşturuldu!\n');

    // 2. Email verifications tablosu
    console.log('📋 Email verifications tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Email verifications tablosu oluşturuldu!\n');

    // 3. Portfolio items tablosu
    console.log('📋 Portfolio items tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency')),
        quantity DECIMAL(20,8) NOT NULL DEFAULT 0,
        average_price DECIMAL(15,2) NOT NULL DEFAULT 0,
        current_price DECIMAL(15,2) NOT NULL DEFAULT 0,
        total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        profit_loss DECIMAL(15,2) NOT NULL DEFAULT 0,
        profit_loss_percent DECIMAL(10,4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, symbol, asset_type)
      );
    `);
    console.log('✅ Portfolio items tablosu oluşturuldu!\n');

    // 4. Transactions tablosu
    console.log('📋 Transactions tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(4) NOT NULL CHECK (type IN ('buy', 'sell')),
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('crypto', 'stock', 'commodity', 'currency')),
        quantity DECIMAL(20,8) NOT NULL,
        price DECIMAL(15,2) NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        commission DECIMAL(15,2) NOT NULL DEFAULT 0,
        net_amount DECIMAL(15,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Transactions tablosu oluşturuldu!\n');

    // 5. Activity logs tablosu
    console.log('📋 Activity logs tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        metadata JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Activity logs tablosu oluşturuldu!\n');

    // 6. Market data cache tablosu
    console.log('📋 Market data cache tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_data_cache (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_type VARCHAR(10) NOT NULL CHECK (asset_type IN ('stock', 'crypto')),
        symbol VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(15,2) NOT NULL,
        change DECIMAL(15,2) NOT NULL DEFAULT 0,
        change_percent DECIMAL(10,4) NOT NULL DEFAULT 0,
        volume BIGINT DEFAULT 0,
        market_cap BIGINT DEFAULT 0,
        previous_close DECIMAL(15,2),
        open_price DECIMAL(15,2),
        high_price DECIMAL(15,2),
        low_price DECIMAL(15,2),
        metadata JSONB,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        UNIQUE(asset_type, symbol)
      );
    `);
    console.log('✅ Market data cache tablosu oluşturuldu!\n');

    // 7. Currency rates tablosu (döviz kurları - NosyAPI)
    console.log('📋 Currency rates tablosu oluşturuluyor...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS currency_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        buying DECIMAL(15,4) NOT NULL,
        selling DECIMAL(15,4) NOT NULL,
        change_rate DECIMAL(10,4) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_currency_rates_code ON currency_rates(code);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_currency_rates_updated_at ON currency_rates(updated_at DESC);`);
    console.log('✅ Currency rates tablosu oluşturuldu!\n');

    // Index'ler oluştur
    console.log('📊 Index\'ler oluşturuluyor...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_portfolio_items_user_id ON portfolio_items(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_type ON activity_logs(activity_type);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_market_cache_asset_type ON market_data_cache(asset_type);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_market_cache_symbol ON market_data_cache(symbol);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_market_cache_expires_at ON market_data_cache(expires_at);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_market_cache_cached_at ON market_data_cache(cached_at DESC);
    `);
    
    console.log('✅ Index\'ler oluşturuldu!\n');

    console.log('🎉 Tüm tablolar başarıyla oluşturuldu!');
    
  } catch (error) {
    console.error('❌ Hata:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Script'i çalıştır
createAllTables();

