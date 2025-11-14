# Kullanıcı Oluşturma Rehberi

## 🚀 Hızlı Başlangıç

### Yöntem 1: Node.js Scripti (Önerilen) ✅

En kolay ve güvenli yöntem. Şifreler otomatik olarak bcrypt ile hash'lenir.

```bash
# Varsayılan kullanıcı oluştur (trading_platform)
npm run create-user

# Özel kullanıcı oluştur
npm run create-user <username> <email> <password> [verified] [balance]

# Örnekler:
npm run create-user trader1 trader1@example.com trader123
npm run create-user investor1 investor1@example.com investor123 true 200000
```

**Varsayılan Kullanıcı:**
- Username: `trading_platform`
- Email: `trading@platform.com`
- Password: `trading123`
- Balance: `100,000 TL`
- Email Verified: `true`

---

### Yöntem 2: SQL Scripti (Manuel)

SQL scripti kullanmak için önce Node.js scripti ile şifre hash'ini oluşturun:

```bash
npm run create-user trading_platform trading@platform.com trading123
```

Script çıktısında `password_hash` değerini kopyalayın ve SQL scriptine yapıştırın.

Sonra `backend/src/scripts/createUser.sql` dosyasını pgAdmin'de çalıştırın.

---

## 📋 Kullanıcı Bilgileri

### Test Kullanıcısı (trading_platform)

```
Username: trading_platform
Email: trading@platform.com
Password: trading123
Balance: 100,000 TL
```

---

## 🔧 Script Detayları

### createUser.ts

**Özellikler:**
- ✅ Otomatik şifre hash'leme (bcrypt)
- ✅ Mevcut kullanıcı kontrolü
- ✅ Kullanıcı silme seçeneği
- ✅ Detaylı çıktı ve bilgilendirme
- ✅ SQL hash çıktısı

**Kullanım:**
```bash
# Varsayılan
npm run create-user

# Özel kullanıcı
npm run create-user username email password [verified] [balance]
```

**Parametreler:**
- `username`: Kullanıcı adı (zorunlu)
- `email`: Email adresi (zorunlu)
- `password`: Şifre (zorunlu)
- `verified`: Email doğrulandı mı? (true/false, varsayılan: true)
- `balance`: Başlangıç bakiyesi (varsayılan: 100000.00)

---

## 📝 Örnek Kullanımlar

### 1. Basit Kullanıcı
```bash
npm run create-user testuser test@example.com test123
```

### 2. Email Doğrulanmamış Kullanıcı
```bash
npm run create-user newuser new@example.com newpass false
```

### 3. Yüksek Bakiye ile Kullanıcı
```bash
npm run create-user richuser rich@example.com richpass true 500000
```

### 4. Tüm Parametrelerle
```bash
npm run create-user trader1 trader1@example.com trader123 true 200000
```

---

## ⚠️ Önemli Notlar

1. **Şifre Güvenliği:** Şifreler bcrypt ile hash'lenir (salt rounds: 10)
2. **Mevcut Kullanıcı:** Script mevcut kullanıcıyı tespit eder ve silme seçeneği sunar
3. **Email Uniqueness:** Email adresi benzersiz olmalıdır
4. **Username Uniqueness:** Kullanıcı adı benzersiz olmalıdır

---

## 🐛 Sorun Giderme

### Hata: "Kullanıcı zaten mevcut"
```bash
# Mevcut kullanıcıyı silmek için scripti tekrar çalıştırın ve 'e' yanıtını verin
npm run create-user
```

### Hata: "Database connection failed"
- PostgreSQL servisinin çalıştığından emin olun
- `.env` dosyasındaki database bilgilerini kontrol edin

### Hata: "Email already exists"
- Farklı bir email adresi kullanın
- Veya mevcut kullanıcıyı silin

---

## 📚 İlgili Dosyalar

- `backend/src/scripts/createUser.ts` - Node.js scripti
- `backend/src/scripts/createUser.sql` - SQL scripti
- `backend/src/scripts/createTestUsers.ts` - Çoklu test kullanıcıları

---

## 💡 İpuçları

1. **Test Kullanıcıları:** Çoklu kullanıcı için `npm run create-users` kullanın
2. **SQL Hash:** Node.js scripti çıktısında SQL hash'i gösterilir
3. **Otomatik Silme:** Script mevcut kullanıcıyı silme seçeneği sunar
4. **Balance:** Varsayılan bakiye 100,000 TL'dir

