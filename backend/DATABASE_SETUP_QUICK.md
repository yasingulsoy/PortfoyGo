# Hızlı Veritabanı Kurulumu

## 1. .env Dosyası Oluştur

`backend` klasöründe `.env` dosyası oluşturun:

```env
DATABASE_URL=postgresql://postgres:@localhost:5432/trading_platform
JWT_SECRET=your_super_secret_jwt_key_here
NODE_ENV=development
```

**Önemli:** 
- Eğer PostgreSQL şifreniz varsa: `postgresql://postgres:şifreniz@localhost:5432/trading_platform`
- Şifre yoksa: `postgresql://postgres@localhost:5432/trading_platform`

## 2. Tabloları Oluştur

pgAdmin'de `trading_platform` veritabanında `setupDatabase.sql` scriptini çalıştırın.

## 3. Kullanıcı Oluştur

```bash
cd backend
npm run create-user
```

## Sorun Giderme

### Hata: "client password must be a string"
- `.env` dosyasını kontrol edin
- `DATABASE_URL` formatını kontrol edin
- Şifre varsa mutlaka belirtin

### Hata: "Connection refused"
- PostgreSQL servisinin çalıştığından emin olun
- Port 5432'nin açık olduğundan emin olun

