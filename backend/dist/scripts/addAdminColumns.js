"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
async function addAdminColumns() {
    try {
        console.log('🔧 Admin kolonları ekleniyor...\n');
        // is_admin kolonu ekle
        await database_1.default.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    `);
        console.log('✅ is_admin kolonu eklendi');
        // is_banned kolonu ekle
        await database_1.default.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
    `);
        console.log('✅ is_banned kolonu eklendi');
        console.log('\n✅ Tüm admin kolonları başarıyla eklendi!');
    }
    catch (error) {
        console.error('❌ Hata:', error);
        throw error;
    }
    finally {
        await database_1.default.end();
    }
}
addAdminColumns();
//# sourceMappingURL=addAdminColumns.js.map