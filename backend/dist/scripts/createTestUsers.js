"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
async function createTestUsers() {
    try {
        console.log('🧪 Test kullanıcıları oluşturuluyor...');
        // Test kullanıcıları
        const testUsers = [
            {
                username: 'yasingulsoy',
                email: 'yasingulsoy02@gmail.com',
                password: 'admin123',
                email_verified: true
            },
            {
                username: 'testuser1',
                email: 'test1@example.com',
                password: 'password123',
                email_verified: true
            },
            {
                username: 'testuser2',
                email: 'test2@example.com',
                password: 'password123',
                email_verified: true
            },
            {
                username: 'trader1',
                email: 'trader1@example.com',
                password: 'trader123',
                email_verified: true
            },
            {
                username: 'investor1',
                email: 'investor1@example.com',
                password: 'investor123',
                email_verified: true
            }
        ];
        for (const user of testUsers) {
            // Kullanıcı zaten var mı kontrol et
            const existingUser = await database_1.default.query('SELECT id FROM users WHERE email = $1', [user.email]);
            if (existingUser.rows.length > 0) {
                console.log(`⚠️  Kullanıcı zaten mevcut: ${user.email}`);
                continue;
            }
            // Şifreyi hashle
            const saltRounds = 10;
            const passwordHash = await bcryptjs_1.default.hash(user.password, saltRounds);
            // Kullanıcıyı oluştur
            const result = await database_1.default.query(`INSERT INTO users (username, email, password_hash, email_verified, balance) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, username, email`, [user.username, user.email, passwordHash, user.email_verified, 100000.00]);
            const newUser = result.rows[0];
            console.log(`✅ Kullanıcı oluşturuldu: ${newUser.username} (${newUser.email})`);
        }
        // Örnek portföy verileri ekle
        await addSamplePortfolioData();
        console.log('🎉 Tüm test kullanıcıları başarıyla oluşturuldu!');
        console.log('\n📋 Test Kullanıcıları:');
        console.log('Email: yasingulsoy02@gmail.com | Şifre: admin123');
        console.log('Email: test1@example.com | Şifre: password123');
        console.log('Email: test2@example.com | Şifre: password123');
        console.log('Email: trader1@example.com | Şifre: trader123');
        console.log('Email: investor1@example.com | Şifre: investor123');
    }
    catch (error) {
        console.error('❌ Hata:', error);
    }
    finally {
        await database_1.default.end();
    }
}
async function addSamplePortfolioData() {
    try {
        console.log('📊 Örnek portföy verileri ekleniyor...');
        // Kullanıcıları al
        const users = await database_1.default.query('SELECT id, username FROM users WHERE email_verified = true');
        for (const user of users.rows) {
            // Her kullanıcı için farklı portföy verileri
            const portfolioItems = [
                {
                    symbol: 'BTC',
                    name: 'Bitcoin',
                    asset_type: 'crypto',
                    quantity: Math.random() * 2 + 0.1, // 0.1 - 2.1 arası
                    average_price: 40000 + Math.random() * 10000, // 40000 - 50000 arası
                    current_price: 45000 + Math.random() * 5000, // 45000 - 50000 arası
                },
                {
                    symbol: 'ETH',
                    name: 'Ethereum',
                    asset_type: 'crypto',
                    quantity: Math.random() * 10 + 1, // 1 - 11 arası
                    average_price: 2500 + Math.random() * 500, // 2500 - 3000 arası
                    current_price: 2800 + Math.random() * 200, // 2800 - 3000 arası
                },
                {
                    symbol: 'AAPL',
                    name: 'Apple Inc.',
                    asset_type: 'stock',
                    quantity: Math.random() * 50 + 10, // 10 - 60 arası
                    average_price: 150 + Math.random() * 20, // 150 - 170 arası
                    current_price: 160 + Math.random() * 10, // 160 - 170 arası
                }
            ];
            for (const item of portfolioItems) {
                const totalValue = item.quantity * item.current_price;
                const profitLoss = (item.current_price - item.average_price) * item.quantity;
                const profitLossPercent = ((item.current_price - item.average_price) / item.average_price) * 100;
                // Portföy öğesini ekle
                await database_1.default.query(`INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price, total_value, profit_loss, profit_loss_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (user_id, symbol, asset_type) DO NOTHING`, [
                    user.id,
                    item.symbol,
                    item.name,
                    item.asset_type,
                    item.quantity,
                    item.average_price,
                    item.current_price,
                    totalValue,
                    profitLoss,
                    profitLossPercent
                ]);
                // Örnek işlem geçmişi ekle
                const transactionType = Math.random() > 0.5 ? 'buy' : 'sell';
                const totalAmount = item.quantity * item.average_price;
                const commission = totalAmount * 0.0025; // %0.25 komisyon
                const netAmount = transactionType === 'buy' ? totalAmount + commission : totalAmount - commission;
                await database_1.default.query(`INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                    user.id,
                    transactionType,
                    item.symbol,
                    item.name,
                    item.asset_type,
                    item.quantity,
                    item.average_price,
                    totalAmount,
                    commission,
                    netAmount
                ]);
            }
            console.log(`📈 ${user.username} için portföy verileri eklendi`);
        }
    }
    catch (error) {
        console.error('❌ Portföy verileri eklenirken hata:', error);
    }
}
// Script'i çalıştır
createTestUsers();
//# sourceMappingURL=createTestUsers.js.map