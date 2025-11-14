import express from 'express';
import { AuthService } from '../services/auth';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

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

    const result = await AuthService.register({ username, email, password });
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
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

    const result = await AuthService.login({ email, password });
    
    if (result.success) {
      // Activity log kaydı (asenkron)
      setImmediate(async () => {
        try {
          const { ActivityLogService } = await import('../services/activityLog');
          const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
          const userAgent = req.headers['user-agent'];
          
          await ActivityLogService.createLog({
            user_id: result.user!.id,
            activity_type: 'login',
            description: 'Kullanıcı giriş yaptı',
            metadata: {
              email: result.user!.email,
              username: result.user!.username
            },
            ip_address: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
            user_agent: userAgent
          });
        } catch (error) {
          console.error('Activity log error:', error);
        }
      });
      
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Login route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Profil bilgileri
router.get('/profile', authenticateToken, async (req: any, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Profile route error:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Token doğrulama
router.get('/verify', authenticateToken, async (req: any, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

export default router;
