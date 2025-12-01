import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
export declare const isAdmin: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=admin.d.ts.map