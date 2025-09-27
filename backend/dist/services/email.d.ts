export declare class EmailService {
    private transporter;
    constructor();
    generateVerificationCode(): string;
    sendVerificationCode(email: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verifyCode(email: string, code: string): Promise<{
        success: boolean;
        message: string;
        userId?: string;
    }>;
    sendPasswordResetCode(email: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
//# sourceMappingURL=email.d.ts.map