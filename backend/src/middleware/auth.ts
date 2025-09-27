import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Erişim token\'ı gerekli' 
    });
  }

  try {
    const user = await AuthService.verifyToken(token);
    if (!user) {
      return res.status(403).json({ 
        success: false, 
        message: 'Geçersiz token' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Geçersiz token' 
    });
  }
};
