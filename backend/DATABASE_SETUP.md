# PostgreSQL Veritabanı Kurulum Rehberi

## pgAdmin ile Kurulum

### 1. pgAdmin'i Açın
- pgAdmin 4'ü başlatın
- PostgreSQL sunucunuza bağlanın (genellikle localhost:5432)

### 2. Yeni Veritabanı Oluşturun

**Yöntem 1: pgAdmin GUI ile**
1. Sol panelde **PostgreSQL** sunucusuna sağ tıklayın
2. **Create** → **Database** seçin
3. Şu bilgileri girin:
   - **Database name**: `trading_platform`
   - **Owner**: `postgres` (veya kendi kullanıcınız)
   - **Encoding**: `UTF8`
   - **Collation**: `Turkish_Turkey.1254` (veya `en_US.UTF8`)
   - **Character type**: `Turkish_Turkey.1254` (veya `en_US.UTF8`)
4. **Save** butonuna tıklayın

**Yöntem 2: SQL ile**
1. Sol panelde **PostgreSQL** sunucusuna sağ tıklayın
2. **Query Tool** seçin
3. Şu komutu çalıştırın:
```sql
CREATE DATABASE trading_platform
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Turkish_Turkey.1254'
    LC_CTYPE = 'Turkish_Turkey.1254'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;
```

### 3. Veritabanına Bağlanın
1. Sol panelde oluşturduğunuz **trading_platform** veritabanına sağ tıklayın
2. **Query Tool** seçin (veya F5 tuşuna basın)

### 4. Tabloları Oluşturun
1. Query Tool'da **File** → **Open** menüsünden `backend/src/scripts/setupDatabase.sql` dosyasını açın
2. Veya `backend/src/scripts/createTables.sql` dosyasını açın (sadece tablolar için)
3. **Execute** butonuna tıklayın (F5)
4. Başarı mesajını kontrol edin

### 5. Kontrol Edin
Tabloların oluşturulduğunu kontrol etmek için:
```sql
-- Tüm tabloları listele
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Users tablosu yapısını kontrol et
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
```

## Veritabanı Bağlantı Ayarları

### Backend .env Dosyası
`backend/.env` dosyanızda şu ayarları yapın:

```env
# PostgreSQL Bağlantı Ayarları
DATABASE_URL=postgresql://postgres:şifreniz@localhost:5432/trading_platform

# Veya ayrı ayrı:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=trading_platform
DB_USER=postgres
DB_PASSWORD=şifreniz

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here_change_this

# Email Ayarları (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Node Environment
NODE_ENV=development
```

### Bağlantı String Formatı
```
postgresql://[kullanıcı]:[şifre]@[host]:[port]/[veritabanı]
```

**Örnekler:**
- Yerel (şifre yok): `postgresql://postgres@localhost:5432/trading_platform`
- Yerel (şifre var): `postgresql://postgres:mypassword@localhost:5432/trading_platform`
- Uzak sunucu: `postgresql://user:pass@192.168.1.100:5432/trading_platform`

## Oluşturulan Tablolar

### 1. users
Kullanıcı bilgileri ve hesapları
- **Varsayılan bakiye**: 100,000 TL
- **Email doğrulama**: email_verified alanı ile kontrol edilir

### 2. email_verifications
Email doğrulama kodları
- **Süre**: 15 dakika (doğrulama için), 30 dakika (şifre sıfırlama için)
- **Kullanım**: used alanı ile kontrol edilir

### 3. portfolio_items
Kullanıcı portföy öğeleri
- **Varlık tipleri**: `crypto` veya `stock`
- **Benzersizlik**: Her kullanıcı için aynı sembol ve tip kombinasyonu tekrar edemez

### 4. transactions
İşlem geçmişi
- **İşlem tipleri**: `buy` (alış) veya `sell` (satış)
- **Komisyon**: Her işlemde otomatik hesaplanır

## Test Kullanıcıları Oluşturma

Tablolar oluşturulduktan sonra test kullanıcıları eklemek için:

```bash
cd backend
npm run create-users
```

## Sorun Giderme

### Bağlantı Hatası (ECONNREFUSED)
1. PostgreSQL servisinin çalıştığından emin olun
2. Port 5432'nin açık olduğunu kontrol edin
3. `pg_hba.conf` dosyasında bağlantı izinlerini kontrol edin

### Tablo Zaten Var Hatası
- Script `CREATE TABLE IF NOT EXISTS` kullanıyor, bu yüzden hata vermez
- Eğer tabloyu silmek isterseniz:
```sql
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS portfolio_items CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

### UUID Extension Hatası
Eğer `gen_random_uuid()` çalışmazsa:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## İpuçları

- **pgAdmin Query Tool**: F5 ile çalıştırma, Ctrl+Space ile autocomplete
- **Tablo görüntüleme**: Sol panelde tabloya sağ tık → **View/Edit Data** → **All Rows**
- **Tablo yapısı**: Tabloya sağ tık → **Properties** → **Columns** sekmesi

