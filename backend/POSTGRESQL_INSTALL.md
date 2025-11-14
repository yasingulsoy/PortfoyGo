# PostgreSQL Kurulum Rehberi (Windows)

## Yöntem 1: PostgreSQL Resmi Installer (Önerilen)

### Adım 1: İndirme
1. Tarayıcınızda şu adrese gidin: **https://www.postgresql.org/download/windows/**
2. **"Download the installer"** butonuna tıklayın
3. **"Download"** butonuna tıklayın (en son sürümü indirin, örn: PostgreSQL 15 veya 16)

### Adım 2: Kurulum
1. İndirdiğiniz `.exe` dosyasını çalıştırın
2. **"Next"** butonlarına tıklayarak ilerleyin
3. **Installation Directory**: Varsayılanı bırakın (C:\Program Files\PostgreSQL\15)
4. **Select Components**: Tüm bileşenleri seçili bırakın (özellikle **pgAdmin 4** önemli!)
5. **Data Directory**: Varsayılanı bırakın
6. **Password**: **Superuser (postgres) için güçlü bir şifre belirleyin** ⚠️ **BU ŞİFREYİ UNUTMAYIN!**
7. **Port**: `5432` (varsayılan, değiştirmeyin)
8. **Advanced Options**: 
   - **Locale**: `Turkish, Turkey` veya `English, United States` seçin
9. **Pre Installation Summary**: Kontrol edin ve **Next** tıklayın
10. Kurulum tamamlanana kadar bekleyin
11. **Stack Builder** açılırsa, şimdilik **Cancel** yapabilirsiniz

### Adım 3: Kurulum Sonrası Kontrol
1. **Windows + R** → `services.msc` → Enter
2. **postgresql** arayın
3. Servis **Running** (Çalışıyor) durumunda olmalı

### Adım 4: pgAdmin'i Açma
1. Başlat menüsünden **pgAdmin 4**'ü açın
2. İlk açılışta master password isteyebilir (pgAdmin için, PostgreSQL şifresi değil)
3. Sol panelde **Servers** → **PostgreSQL 15** (veya kurduğunuz sürüm) görünmeli
4. Sunucuya çift tıklayın veya sağ tık → **Connect Server**
5. Şifre istenirse, kurulumda belirlediğiniz **postgres** şifresini girin

## Yöntem 2: Chocolatey ile (Geliştiriciler için)

Eğer Chocolatey kuruluysa:

```powershell
# PowerShell'i Yönetici olarak açın
choco install postgresql15
```

## Yöntem 3: Docker ile (Alternatif)

Eğer Docker Desktop kuruluysa:

```bash
docker run --name postgres-portfoygo `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=trading_platform `
  -p 5432:5432 `
  -d postgres:15
```

**Not**: Docker kullanıyorsanız, pgAdmin'i ayrı kurmanız gerekir veya Docker container içindeki psql kullanabilirsiniz.

## Kurulum Sonrası Test

### pgAdmin ile Test
1. pgAdmin'i açın
2. Sol panelde PostgreSQL sunucusuna bağlanın
3. **Databases** → sağ tık → **Create** → **Database**
4. Database name: `test_db` yazın
5. Başarılı olursa kurulum tamam!

### Command Line ile Test
1. **Windows + R** → `cmd` → Enter
2. Şu komutu çalıştırın:

```cmd
psql -U postgres
```

Şifre istenirse, kurulumda belirlediğiniz şifreyi girin.

## Sorun Giderme

### pgAdmin açılmıyor
- Bilgisayarı yeniden başlatın
- pgAdmin'i Yönetici olarak çalıştırın

### Servis başlamıyor
- Services penceresinde servise sağ tık → **Properties** → **Startup type**: **Automatic** yapın
- Servisi manuel başlatın

### Port 5432 kullanımda
- Başka bir PostgreSQL kurulumu olabilir
- Veya başka bir uygulama portu kullanıyor olabilir
- Services'te tüm PostgreSQL servislerini kontrol edin

## Sonraki Adımlar

PostgreSQL kurulduktan sonra:

1. pgAdmin'de sunucuya bağlanın
2. `trading_platform` veritabanını oluşturun
3. `backend/src/scripts/setupDatabase.sql` dosyasını çalıştırın

Detaylı adımlar için `DATABASE_SETUP.md` dosyasına bakın.

