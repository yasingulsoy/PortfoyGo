import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { User } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/** Route içinde kimliği doğrulanmış kullanıcıyı (authenticateToken sonrası) döndürür. */
export function requireUser(req: Request): User {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    // authenticateToken middleware'i olmadan çağrılırsa
    throw new Error('requireUser called without authenticateToken');
  }
  return user;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const [scheme, token] = typeof authHeader === 'string' ? authHeader.split(' ') : [];

  if (!token || scheme?.toLowerCase() !== 'bearer') {
    return res.status(401).json({
      success: false,
      message: "Erişim token'ı gerekli",
    });
  }

  try {
    const user = await AuthService.verifyToken(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Oturum geçersiz veya süresi dolmuş',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
