// Finnhub API Test Script
const https = require('https');

// API key'inizi buraya yazın
const API_KEY = 'd3br09pr01qqg7bvqai0d3br09pr01qqg7bvqaig';

// Test fonksiyonu
async function testFinnhubAPI() {
    console.log('🔍 Finnhub API testi başlatılıyor...\n');
    
    // 1. Profil bilgilerini kontrol et
    console.log('1. Profil bilgileri kontrol ediliyor...');
    try {
        const profileData = await makeRequest(`https://finnhub.io/api/v1/profile?symbol=AAPL&token=${API_KEY}`);
        console.log('✅ Profil API çalışıyor:', profileData.name || 'Veri alındı');
    } catch (error) {
        console.log('❌ Profil API hatası:', error.message);
    }
    
    // 2. Hisse senedi fiyatını kontrol et
    console.log('\n2. Hisse senedi fiyatı kontrol ediliyor...');
    try {
        const quoteData = await makeRequest(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${API_KEY}`);
        console.log('✅ Quote API çalışıyor:', `$${quoteData.c || 'Fiyat alındı'}`);
    } catch (error) {
        console.log('❌ Quote API hatası:', error.message);
    }
    
    // 3. Kripto para fiyatını kontrol et
    console.log('\n3. Kripto para fiyatı kontrol ediliyor...');
    try {
        const cryptoData = await makeRequest(`https://finnhub.io/api/v1/crypto/candle?symbol=BINANCE:BTCUSDT&resolution=1&from=${Math.floor(Date.now() / 1000) - 3600}&to=${Math.floor(Date.now() / 1000)}&token=${API_KEY}`);
        console.log('✅ Kripto API çalışıyor:', 'Veri alındı');
    } catch (error) {
        console.log('❌ Kripto API hatası:', error.message);
    }
    
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
    testFinnhubAPI().catch(console.error);
}
