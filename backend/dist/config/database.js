"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Pool yapılandırması - connectionString yerine ayrı parametreler kullan
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'trading_platform',
    user: process.env.DB_USER || 'postgres',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};
// Şifre varsa ekle (undefined, null veya boş string değilse)
const dbPassword = process.env.DB_PASSWORD;
if (dbPassword !== undefined && dbPassword !== null && dbPassword.trim() !== '') {
    poolConfig.password = dbPassword;
}
// Eğer DATABASE_URL varsa onu kullan
if (process.env.DATABASE_URL) {
    poolConfig.connectionString = process.env.DATABASE_URL;
    // connectionString kullanıldığında diğer parametreleri kaldır
    delete poolConfig.host;
    delete poolConfig.port;
    delete poolConfig.database;
    delete poolConfig.user;
    delete poolConfig.password;
}
const pool = new pg_1.Pool(poolConfig);
exports.default = pool;
//# sourceMappingURL=database.js.map