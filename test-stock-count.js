// Borsa Senedi Sayısı Test Scripti
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

// API key'i .env dosyasından al
const API_KEY = process.env.FINNHUB_API_KEY || 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';

// Test fonksiyonu
async function testStockCount() {
    console.log('🔍 Borsa Senedi Sayısı Testi Başlatılıyor...\n');
    
    // 1. US borsasındaki toplam hisse senedi sayısı
    console.log('1. US Borsasındaki Toplam Hisse Senedi Sayısı:');
    try {
        const usSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${API_KEY}`);
        console.log(`   ✅ US Borsası: ${usSymbols.length} adet hisse senedi`);
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    // 2. NASDAQ borsasındaki toplam hisse senedi sayısı
    console.log('\n2. NASDAQ Borsasındaki Toplam Hisse Senedi Sayısı:');
    try {
        const nasdaqSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=NASDAQ&token=${API_KEY}`);
        console.log(`   ✅ NASDAQ: ${nasdaqSymbols.length} adet hisse senedi`);
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    // 3. NYSE borsasındaki toplam hisse senedi sayısı
    console.log('\n3. NYSE Borsasındaki Toplam Hisse Senedi Sayısı:');
    try {
        const nyseSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=NYSE&token=${API_KEY}`);
        console.log(`   ✅ NYSE: ${nyseSymbols.length} adet hisse senedi`);
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    // 4. BIST (İstanbul Borsası) hisse senedi sayısı
    console.log('\n4. BIST (İstanbul Borsası) Hisse Senedi Sayısı:');
    try {
        const bistSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=XIST&token=${API_KEY}`);
        console.log(`   ✅ BIST: ${bistSymbols.length} adet hisse senedi`);
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    // 5. İlk 10 hisse senedi örneği (US)
    console.log('\n5. US Borsasından İlk 10 Hisse Senedi Örneği:');
    try {
        const usSymbols = await makeRequest(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${API_KEY}`);
        const first10 = usSymbols.slice(0, 10);
        first10.forEach((stock, index) => {
            console.log(`   ${index + 1}. ${stock.symbol} - ${stock.description || 'N/A'}`);
        });
    } catch (error) {
        console.log(`   ❌ Hata: ${error.message}`);
    }
    
    console.log('\n🎉 Test tamamlandı!');
    console.log('\n💡 Kullanım Örnekleri:');
    console.log('   - Backend API: GET /api/stocks/count/US');
    console.log('   - Backend API: GET /api/stocks/count/NASDAQ');
    console.log('   - Backend API: GET /api/stocks/counts/all');
    console.log('   - Backend API: GET /api/stocks/symbols/US');
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
    testStockCount().catch(console.error);
}

