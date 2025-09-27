"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const email_1 = require("../services/email");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const emailService = new email_1.EmailService();
// Email doğrulama kodu gönder
router.post('/send-verification', auth_1.authenticateToken, async (req, res) => {
    try {
        const { email } = req.body;
        const userId = req.user.id;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email adresi gerekli'
            });
        }
        const result = await emailService.sendVerificationCode(email, userId);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Send verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Email doğrulama kodu kontrol et
router.post('/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email ve doğrulama kodu gerekli'
            });
        }
        const result = await emailService.verifyCode(email, code);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
// Şifre sıfırlama kodu gönder
router.post('/send-reset', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email adresi gerekli'
            });
        }
        const result = await emailService.sendPasswordResetCode(email);
        if (result.success) {
            res.json(result);
        }
        else {
            res.status(400).json(result);
        }
    }
    catch (error) {
        console.error('Send reset code error:', error);
        res.status(500).json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});
exports.default = router;
//# sourceMappingURL=email.js.map