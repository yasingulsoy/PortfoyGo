// Aktif Hisse Senetleri Test Scripti
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

// API key'i .env dosyasından al
const API_KEY = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';

// Test fonksiyonu
async function testActiveStocks() {
    console.log('🔍 Aktif Hisse Senetleri Testi Başlatılıyor...\n');
    
    // 1. Tüm sembolleri çek
    console.log('1. Tüm sembolleri çekiliyor...');
    try {
        const allSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${API_KEY}`);
        console.log(`   ✅ Toplam ${allSymbols.length} sembol bulundu`);
        
        // 2. Filtreleme kriterleri
        console.log('\n2. Filtreleme kriterleri uygulanıyor...');
        const filtered = allSymbols.filter(symbol => {
            const type = symbol.type?.toUpperCase() || '';
            const isCommonStock = type === 'COMMON STOCK' || type === 'CS' || type === 'EQ';
            const hasDescription = symbol.description && symbol.description.trim().length > 0;
            const hasSymbol = symbol.symbol && symbol.symbol.trim().length > 0;
            return isCommonStock && hasDescription && hasSymbol;
        });
        console.log(`   ✅ ${filtered.length} aktif hisse senedi filtrelendi`);
        
        // 3. İlk 20'nin örnekleri
        console.log('\n3. İlk 20 Aktif Hisse Senedi Örneği:');
        const first20 = filtered.slice(0, 20);
        first20.forEach((stock, index) => {
            console.log(`   ${index + 1}. ${stock.symbol} - ${stock.description || 'N/A'} (Type: ${stock.type})`);
        });
        
        // 4. Type dağılımı
        console.log('\n4. Type Dağılımı (İlk 1000 sembol):');
        const typeCounts = {};
        allSymbols.slice(0, 1000).forEach(symbol => {
            const type = symbol.type || 'UNKNOWN';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([type, count]) => {
                console.log(`   - ${type}: ${count} adet`);
            });
        
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    console.log('\n💡 Backend API Kullanımı:');
    console.log('   - GET /api/stocks/active');
    console.log('   - GET /api/stocks/active?exchange=US&maxStocks=500&minMarketCap=1000000000');
    console.log('   - GET /api/stocks/active?maxStocks=1000');
    console.log('\n⚠️  Not: İlk çalıştırmada 500 hisse senedi çekmek ~10-15 dakika sürebilir (rate limiting nedeniyle)');
    console.log('   Sonraki çalıştırmalarda cache kullanılacaktır.');
    console.log('\n🎉 Test tamamlandı!');
}

// HTTP isteği yapmak için yardımcı fonksiyon
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.error) {
                        reject(new Error(jsonData.error));
                    } else {
                        resolve(jsonData);
                    }
                } catch (error) {
                    reject(new Error('JSON parse hatası: ' + error.message));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Scripti çalıştır
if (API_KEY === 'YOUR_API_KEY_HERE') {
    console.log('⚠️  Lütfen API_KEY değişkenine gerçek API key\'inizi yazın!');
    console.log('API key\'inizi https://finnhub.io/dashboard adresinden alabilirsiniz.');
} else {
    testActiveStocks().catch(console.error);
}

