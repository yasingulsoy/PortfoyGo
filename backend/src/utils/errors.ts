import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from './logger';

/**
 * İstemciye güvenle gösterilebilecek mesaj taşıyan hata.
 * Diğer tüm hatalar istemciye genel bir mesajla döner; detaylar sadece loglanır.
 */
export class AppError extends Error {
  readonly status: number;
  readonly publicMessage: string;
  readonly code?: string;

  constructor(status: number, publicMessage: string, code?: string) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new AppError(400, msg, 'BAD_REQUEST');

/** Async route handler'lardaki hataları merkezi error handler'a iletir. */
export const asyncHandler =
  <Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as Req, res, next).catch(next);
  };

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı',
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  // pino-http'nin isteğe bağlı child logger'ı (req.id taşır); yoksa kök logger
  const log = req.log ?? logger;
  const path = req.originalUrl.split('?')[0];

  if (err instanceof AppError) {
    if (err.status >= 500) {
      log.error({ reqId: req.id, status: err.status, code: err.code }, `[error] ${req.method} ${path} -> ${err.status} ${err.code || ''}: ${err.message}`);
    }
    res.status(err.status).json({ success: false, message: err.publicMessage, ...(err.code ? { code: err.code } : {}) });
    return;
  }

  // body-parser hataları
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Geçersiz JSON gövdesi' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'İstek gövdesi çok büyük' });
    return;
  }

  log.error({ reqId: req.id, err }, `[error] ${req.method} ${path}: ${err?.message || err}`);
  res.status(500).json({ success: false, message: 'Sunucu hatası' });
}
