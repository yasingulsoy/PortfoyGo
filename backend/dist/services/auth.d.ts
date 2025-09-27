import { User, LoginRequest, RegisterRequest, AuthResponse } from '../types';
export declare class AuthService {
    static register(data: RegisterRequest): Promise<AuthResponse>;
    static login(data: LoginRequest): Promise<AuthResponse>;
    static verifyToken(token: string): Promise<User | null>;
}
//# sourceMappingURL=auth.d.ts.map