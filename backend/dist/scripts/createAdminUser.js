"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function createAdminUser() {
    try {
        console.log('🔧 Admin kullanıcısı oluşturuluyor...\n');
        const username = 'admin';
        const email = 'admin@portfoygo.com';
        const password = 'admin';
        // Şifreyi hashle
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        // Kullanıcı zaten var mı kontrol et
        const existingUser = await database_1.default.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (existingUser.rows.length > 0) {
            // Kullanıcı varsa admin yap
            await database_1.default.query(`UPDATE users 
         SET is_admin = TRUE, 
             is_banned = FALSE,
             email_verified = TRUE,
             password_hash = $1
         WHERE username = $2 OR email = $3`, [passwordHash, username, email]);
            console.log('✅ Mevcut kullanıcı admin yapıldı!');
        }
        else {
            // Yeni admin kullanıcısı oluştur
            await database_1.default.query(`INSERT INTO users (username, email, password_hash, email_verified, is_admin, is_banned, balance)
         VALUES ($1, $2, $3, TRUE, TRUE, FALSE, 1000000.00)
         ON CONFLICT (username) DO UPDATE SET
           is_admin = TRUE,
           is_banned = FALSE,
           email_verified = TRUE,
           password_hash = EXCLUDED.password_hash`, [username, email, passwordHash]);
            console.log('✅ Admin kullanıcısı oluşturuldu!');
        }
        console.log('\n📋 Admin Bilgileri:');
        console.log('   Username: admin');
        console.log('   Email: admin@portfoygo.com');
        console.log('   Password: admin');
        console.log('\n✅ İşlem tamamlandı!');
    }
    catch (error) {
        console.error('❌ Hata:', error);
        throw error;
    }
    finally {
        await database_1.default.end();
    }
}
createAdminUser();
//# sourceMappingURL=createAdminUser.js.map