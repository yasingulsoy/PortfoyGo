"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const auth_1 = require("../services/auth");
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Erişim token\'ı gerekli'
        });
    }
    try {
        const user = await auth_1.AuthService.verifyToken(token);
        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'Geçersiz token'
            });
        }
        req.user = user;
        next();
    }
    catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Geçersiz token'
        });
    }
};
exports.authenticateToken = authenticateToken;
//# sourceMappingURL=auth.js.map