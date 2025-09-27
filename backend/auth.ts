import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from './db';

export interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number;
  created_at: Date;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface RegisterResult {
  success: boolean;
  user?: User;
  message?: string;
}

// Kullanıcı kayıt
export async function registerUser(
  username: string,
  email: string,
  password: string
): Promise<RegisterResult> {
  try {
    // Kullanıcı var mı kontrol et
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return {
        success: false,
        message: 'Kullanıcı adı veya email zaten kullanılıyor'
      };
    }

    // Şifreyi hashle
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Kullanıcıyı oluştur
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, email_verified) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, email_verified, balance, portfolio_value, total_profit_loss, rank, created_at`,
      [username, email, passwordHash, false]
    );

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
  } catch (error) {
    console.error('Register error:', error);
    return {
      success: false,
      message: 'Kayıt sırasında bir hata oluştu'
    };
  }
}

// Kullanıcı giriş
export async function loginUser(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    // Kullanıcıyı bul
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        message: 'Email veya şifre hatalı'
      };
    }

    const user = result.rows[0];

    // Şifreyi kontrol et
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return {
        success: false,
        message: 'Email veya şifre hatalı'
      };
    }

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    // Son giriş zamanını güncelle
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

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
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: 'Giriş sırasında bir hata oluştu'
    };
  }
}

// Token doğrulama
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
    
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.userId]
    );

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
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}
