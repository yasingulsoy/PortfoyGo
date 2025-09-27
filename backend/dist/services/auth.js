"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
class AuthService {
    // Kullanıcı kayıt
    static async register(data) {
        try {
            // Kullanıcı var mı kontrol et
            const existingUser = await database_1.default.query('SELECT id FROM users WHERE username = $1 OR email = $2', [data.username, data.email]);
            if (existingUser.rows.length > 0) {
                return {
                    success: false,
                    message: 'Kullanıcı adı veya email zaten kullanılıyor'
                };
            }
            // Şifreyi hashle
            const saltRounds = 10;
            const passwordHash = await bcryptjs_1.default.hash(data.password, saltRounds);
            // Kullanıcıyı oluştur
            const result = await database_1.default.query(`INSERT INTO users (username, email, password_hash, email_verified) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, email, email_verified, balance, portfolio_value, total_profit_loss, rank, created_at`, [data.username, data.email, passwordHash, false]);
            const user = result.rows[0];
            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    email_verified: user.email_verified,
                    balance: parseFloat(user.balance),
                    portfolio_value: parseFloat(user.portfolio_value),
                    total_profit_loss: parseFloat(user.total_profit_loss),
                    rank: user.rank,
                    created_at: user.created_at
                }
            };
        }
        catch (error) {
            console.error('Register error:', error);
            return {
                success: false,
                message: 'Kayıt sırasında bir hata oluştu'
            };
        }
    }
    // Kullanıcı giriş
    static async login(data) {
        try {
            // Kullanıcıyı bul
            const result = await database_1.default.query('SELECT * FROM users WHERE email = $1', [data.email]);
            if (result.rows.length === 0) {
                return {
                    success: false,
                    message: 'Email veya şifre hatalı'
                };
            }
            const user = result.rows[0];
            // Şifreyi kontrol et
            const isValidPassword = await bcryptjs_1.default.compare(data.password, user.password_hash);
            if (!isValidPassword) {
                return {
                    success: false,
                    message: 'Email veya şifre hatalı'
                };
            }
            // JWT token oluştur
            const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
            // Son giriş zamanını güncelle
            await database_1.default.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    email_verified: user.email_verified,
                    balance: parseFloat(user.balance),
                    portfolio_value: parseFloat(user.portfolio_value),
                    total_profit_loss: parseFloat(user.total_profit_loss),
                    rank: user.rank,
                    created_at: user.created_at
                },
                token
            };
        }
        catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                message: 'Giriş sırasında bir hata oluştu'
            };
        }
    }
    // Token doğrulama
    static async verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret');
            const result = await database_1.default.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
            if (result.rows.length === 0) {
                return null;
            }
            const user = result.rows[0];
            return {
                id: user.id,
                username: user.username,
                email: user.email,
                email_verified: user.email_verified,
                balance: parseFloat(user.balance),
                portfolio_value: parseFloat(user.portfolio_value),
                total_profit_loss: parseFloat(user.total_profit_loss),
                rank: user.rank,
                created_at: user.created_at
            };
        }
        catch (error) {
            console.error('Token verification error:', error);
            return null;
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.js.map