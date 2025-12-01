"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = void 0;
const database_1 = __importDefault(require("../config/database"));
const isAdmin = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Kimlik doğrulama gerekli'
            });
        }
        // Kullanıcının admin olup olmadığını kontrol et
        const result = await database_1.default.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({
                success: false,
                message: 'Bu işlem için admin yetkisi gerekli'
            });
        }
        next();
    }
    catch (error) {
        console.error('Admin check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
};
exports.isAdmin = isAdmin;
//# sourceMappingURL=admin.js.map