"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function run() {
    try {
        const sql = fs_1.default.readFileSync(path_1.default.join(__dirname, 'addCurrencyAssetType.sql'), 'utf8');
        await database_1.default.query(sql);
        console.log('✅ Currency asset_type migration tamamlandı');
    }
    catch (e) {
        if (e.message?.includes('does not exist')) {
            console.log('⚠️ Constraint zaten değiştirilmiş veya mevcut değil');
        }
        else {
            console.error('Hata:', e.message);
        }
    }
    finally {
        await database_1.default.end();
    }
}
run();
//# sourceMappingURL=runCurrencyMigration.js.map