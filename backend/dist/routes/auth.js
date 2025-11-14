"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
            // Activity log kaydı (asenkron)
            setImmediate(async () => {
                try {
                    const { ActivityLogService } = await Promise.resolve().then(() => __importStar(require('../services/activityLog')));
                    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                    const userAgent = req.headers['user-agent'];
                    await ActivityLogService.createLog({
                        user_id: result.user.id,
                        activity_type: 'login',
                        description: 'Kullanıcı giriş yaptı',
                        metadata: {
                            email: result.user.email,
                            username: result.user.username
                        },
                        ip_address: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
                        user_agent: userAgent
                    });
                }
                catch (error) {
                    console.error('Activity log error:', error);
                }
            });
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