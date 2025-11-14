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
exports.TransactionService = void 0;
const database_1 = __importDefault(require("../config/database"));
const COMMISSION_RATE = 0.0025; // %0.25 komisyon
class TransactionService {
    // Alış işlemi
    static async buy(userId, data) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            // Kullanıcı bilgilerini al
            const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
            if (userResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Kullanıcı bulunamadı' };
            }
            const user = userResult.rows[0];
            const totalAmount = data.quantity * data.price;
            const commission = totalAmount * COMMISSION_RATE;
            const netAmount = totalAmount + commission;
            // Bakiye kontrolü
            if (parseFloat(user.balance) < netAmount) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Yetersiz bakiye' };
            }
            // İşlemi kaydet
            console.log('📝 Transaction kaydediliyor:', {
                userId,
                symbol: data.symbol,
                name: data.name,
                asset_type: data.asset_type,
                quantity: data.quantity,
                price: data.price,
                totalAmount,
                commission,
                netAmount
            });
            const transactionResult = await client.query(`INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`, [
                userId,
                'buy',
                data.symbol,
                data.name,
                data.asset_type,
                data.quantity,
                data.price,
                totalAmount,
                commission,
                netAmount
            ]);
            const transaction = transactionResult.rows[0];
            console.log('✅ Transaction başarıyla kaydedildi:', transaction.id);
            // Bakiyeyi güncelle
            await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [netAmount, userId]);
            // Portföy öğesini güncelle veya oluştur
            const portfolioResult = await client.query(`SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3`, [userId, data.symbol, data.asset_type]);
            if (portfolioResult.rows.length > 0) {
                // Mevcut portföy öğesini güncelle
                const existingItem = portfolioResult.rows[0];
                const totalQuantity = parseFloat(existingItem.quantity) + data.quantity;
                const totalCost = (parseFloat(existingItem.average_price) * parseFloat(existingItem.quantity)) + totalAmount;
                const newAveragePrice = totalCost / totalQuantity;
                await client.query(`UPDATE portfolio_items 
           SET quantity = $1, average_price = $2, current_price = $3, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4 AND symbol = $5 AND asset_type = $6`, [totalQuantity, newAveragePrice, data.price, userId, data.symbol, data.asset_type]);
            }
            else {
                // Yeni portföy öğesi oluştur
                await client.query(`INSERT INTO portfolio_items (user_id, symbol, name, asset_type, quantity, average_price, current_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, data.symbol, data.name, data.asset_type, data.quantity, data.price, data.price]);
            }
            // Portföy değerlerini güncelle
            await this.updatePortfolioValue(userId, client);
            console.log('💾 Alış transaction commit ediliyor...');
            await client.query('COMMIT');
            console.log('✅ Alış transaction başarıyla commit edildi');
            // Activity log kaydı (asenkron, hata olsa bile devam et)
            setImmediate(async () => {
                try {
                    const { ActivityLogService } = await Promise.resolve().then(() => __importStar(require('./activityLog')));
                    await ActivityLogService.createLog({
                        user_id: userId,
                        activity_type: 'buy',
                        description: `${data.quantity} adet ${data.name} (${data.symbol}) alındı`,
                        metadata: {
                            symbol: data.symbol,
                            name: data.name,
                            asset_type: data.asset_type,
                            quantity: data.quantity,
                            price: data.price,
                            total_amount: totalAmount,
                            commission,
                            net_amount: netAmount,
                            transaction_id: transaction.id
                        }
                    });
                }
                catch (error) {
                    console.error('Activity log error:', error);
                }
            });
            // Rozet kontrolü (asenkron, hata olsa bile devam et)
            setImmediate(async () => {
                try {
                    const { BadgeService } = await Promise.resolve().then(() => __importStar(require('./badges')));
                    await BadgeService.checkAndAwardBadges(userId);
                }
                catch (error) {
                    console.error('Badge check error:', error);
                }
            });
            // Güncellenmiş portföy öğesini al
            const updatedPortfolioResult = await client.query(`SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3`, [userId, data.symbol, data.asset_type]);
            return {
                success: true,
                transaction: {
                    id: transaction.id,
                    user_id: transaction.user_id,
                    type: transaction.type,
                    symbol: transaction.symbol,
                    name: transaction.name,
                    asset_type: transaction.asset_type,
                    quantity: parseFloat(transaction.quantity),
                    price: parseFloat(transaction.price),
                    total_amount: parseFloat(transaction.total_amount),
                    commission: parseFloat(transaction.commission),
                    net_amount: parseFloat(transaction.net_amount),
                    created_at: transaction.created_at
                },
                portfolioItem: updatedPortfolioResult.rows[0] ? {
                    id: updatedPortfolioResult.rows[0].id,
                    user_id: updatedPortfolioResult.rows[0].user_id,
                    symbol: updatedPortfolioResult.rows[0].symbol,
                    name: updatedPortfolioResult.rows[0].name,
                    asset_type: updatedPortfolioResult.rows[0].asset_type,
                    quantity: parseFloat(updatedPortfolioResult.rows[0].quantity),
                    average_price: parseFloat(updatedPortfolioResult.rows[0].average_price),
                    current_price: parseFloat(updatedPortfolioResult.rows[0].current_price),
                    total_value: parseFloat(updatedPortfolioResult.rows[0].total_value || 0),
                    profit_loss: parseFloat(updatedPortfolioResult.rows[0].profit_loss || 0),
                    profit_loss_percent: parseFloat(updatedPortfolioResult.rows[0].profit_loss_percent || 0),
                    created_at: updatedPortfolioResult.rows[0].created_at,
                    updated_at: updatedPortfolioResult.rows[0].updated_at
                } : undefined
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Buy transaction error:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                detail: error.detail,
                stack: error.stack
            });
            return {
                success: false,
                message: error.message || 'İşlem sırasında bir hata oluştu'
            };
        }
        finally {
            client.release();
        }
    }
    // Satış işlemi
    static async sell(userId, data) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            // Portföy öğesini kontrol et
            const portfolioResult = await client.query(`SELECT * FROM portfolio_items WHERE user_id = $1 AND symbol = $2`, [userId, data.symbol]);
            if (portfolioResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Portföyde bu varlık bulunamadı' };
            }
            const portfolioItem = portfolioResult.rows[0];
            // Miktar kontrolü
            if (parseFloat(portfolioItem.quantity) < data.quantity) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Yetersiz miktar' };
            }
            // Güncel fiyatı al (portföy öğesindeki current_price kullanılır)
            const currentPrice = parseFloat(portfolioItem.current_price);
            const totalAmount = data.quantity * currentPrice;
            const commission = totalAmount * COMMISSION_RATE;
            const netAmount = totalAmount - commission;
            // İşlemi kaydet
            console.log('📝 Satış transaction kaydediliyor:', {
                userId,
                symbol: portfolioItem.symbol,
                name: portfolioItem.name,
                asset_type: portfolioItem.asset_type,
                quantity: data.quantity,
                price: currentPrice,
                totalAmount,
                commission,
                netAmount
            });
            const transactionResult = await client.query(`INSERT INTO transactions (user_id, type, symbol, name, asset_type, quantity, price, total_amount, commission, net_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`, [
                userId,
                'sell',
                portfolioItem.symbol,
                portfolioItem.name,
                portfolioItem.asset_type,
                data.quantity,
                currentPrice,
                totalAmount,
                commission,
                netAmount
            ]);
            const transaction = transactionResult.rows[0];
            console.log('✅ Satış transaction başarıyla kaydedildi:', transaction.id);
            // Bakiyeyi güncelle
            await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [netAmount, userId]);
            // Portföy öğesini güncelle
            const newQuantity = parseFloat(portfolioItem.quantity) - data.quantity;
            if (newQuantity <= 0) {
                // Tüm varlık satıldıysa portföy öğesini sil
                await client.query('DELETE FROM portfolio_items WHERE user_id = $1 AND symbol = $2 AND asset_type = $3', [userId, data.symbol, portfolioItem.asset_type]);
            }
            else {
                // Kısmi satış - miktarı güncelle
                await client.query(`UPDATE portfolio_items 
           SET quantity = $1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2 AND symbol = $3 AND asset_type = $4`, [newQuantity, userId, data.symbol, portfolioItem.asset_type]);
            }
            // Portföy değerlerini güncelle
            await this.updatePortfolioValue(userId, client);
            console.log('💾 Satış transaction commit ediliyor...');
            await client.query('COMMIT');
            console.log('✅ Satış transaction başarıyla commit edildi');
            // Activity log kaydı (asenkron, hata olsa bile devam et)
            setImmediate(async () => {
                try {
                    const { ActivityLogService } = await Promise.resolve().then(() => __importStar(require('./activityLog')));
                    await ActivityLogService.createLog({
                        user_id: userId,
                        activity_type: 'sell',
                        description: `${data.quantity} adet ${portfolioItem.name} (${portfolioItem.symbol}) satıldı`,
                        metadata: {
                            symbol: portfolioItem.symbol,
                            name: portfolioItem.name,
                            asset_type: portfolioItem.asset_type,
                            quantity: data.quantity,
                            price: currentPrice,
                            total_amount: totalAmount,
                            commission,
                            net_amount: netAmount,
                            transaction_id: transaction.id
                        }
                    });
                }
                catch (error) {
                    console.error('Activity log error:', error);
                }
            });
            // Rozet kontrolü (asenkron, hata olsa bile devam et)
            setImmediate(async () => {
                try {
                    const { BadgeService } = await Promise.resolve().then(() => __importStar(require('./badges')));
                    await BadgeService.checkAndAwardBadges(userId);
                }
                catch (error) {
                    console.error('Badge check error:', error);
                }
            });
            return {
                success: true,
                transaction: {
                    id: transaction.id,
                    user_id: transaction.user_id,
                    type: transaction.type,
                    symbol: transaction.symbol,
                    name: transaction.name,
                    asset_type: transaction.asset_type,
                    quantity: parseFloat(transaction.quantity),
                    price: parseFloat(transaction.price),
                    total_amount: parseFloat(transaction.total_amount),
                    commission: parseFloat(transaction.commission),
                    net_amount: parseFloat(transaction.net_amount),
                    created_at: transaction.created_at
                }
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Sell transaction error:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                detail: error.detail,
                stack: error.stack
            });
            return {
                success: false,
                message: error.message || 'İşlem sırasında bir hata oluştu'
            };
        }
        finally {
            client.release();
        }
    }
    // Portföy değerlerini güncelle
    static async updatePortfolioValue(userId, client) {
        // Portföy öğelerini al ve değerleri hesapla
        const portfolioResult = await client.query(`SELECT quantity, current_price, average_price, symbol, asset_type 
       FROM portfolio_items 
       WHERE user_id = $1`, [userId]);
        let totalPortfolioValue = 0;
        let totalProfitLoss = 0;
        for (const item of portfolioResult.rows) {
            const quantity = parseFloat(item.quantity);
            const currentPrice = parseFloat(item.current_price);
            const averagePrice = parseFloat(item.average_price);
            const symbol = item.symbol;
            const assetType = item.asset_type;
            const value = quantity * currentPrice;
            const profitLoss = (currentPrice - averagePrice) * quantity;
            totalPortfolioValue += value;
            totalProfitLoss += profitLoss;
            // Portföy öğesinin değerlerini güncelle
            await client.query(`UPDATE portfolio_items 
         SET total_value = $1, profit_loss = $2, profit_loss_percent = $3, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4 AND symbol = $5 AND asset_type = $6`, [
                value,
                profitLoss,
                averagePrice > 0 ? ((currentPrice - averagePrice) / averagePrice) * 100 : 0,
                userId,
                symbol,
                assetType
            ]);
        }
        // Kullanıcının portföy değerini güncelle
        await client.query(`UPDATE users 
       SET portfolio_value = $1, total_profit_loss = $2 
       WHERE id = $3`, [totalPortfolioValue, totalProfitLoss, userId]);
    }
}
exports.TransactionService = TransactionService;
//# sourceMappingURL=transaction.js.map