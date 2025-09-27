"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../services/auth");
const auth_2 = require("../middleware/auth");
const router = express_1.default.Router();
// Kayıt
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Validasyon
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Tüm alanlar gerekli'
            });
        }
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Şifre en az 6 karakter olmalı'
            });
        }
        const result = await auth_1.AuthService.register({ username, email, password });
        if (result.success) {
            res.status(201).json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Register route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Giriş
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validasyon
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email ve şifre gerekli'
            });
        }
        const result = await auth_1.AuthService.login({ email, password });
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(401).json(result);
        }
    }
    catch (error) {
        console.error('Login route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Profil bilgileri
router.get('/profile', auth_2.authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    }
    catch (error) {
        console.error('Profile route error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Token doğrulama
router.get('/verify', auth_2.authenticateToken, async (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map