# PostgreSQL Bağlantı Sorunları Giderme

## Hata: "connection timeout expired"

Bu hata, PostgreSQL servisinin çalışmadığını gösterir.

## Çözüm: PostgreSQL Servisini Başlatma

### Yöntem 1: Services (Hizmetler) ile (Önerilen)

1. **Windows + R** tuşlarına basın
2. `services.msc` yazın ve Enter'a basın
3. Açılan pencerede **"postgresql"** veya **"PostgreSQL"** arayın
4. Servisi bulun (örnek: `postgresql-x64-15` veya `PostgreSQL Server`)
5. Sağ tıklayın → **Start** (Başlat) seçin
6. Durumun **Running** (Çalışıyor) olduğunu kontrol edin

### Yöntem 2: PowerShell ile

1. **Windows + X** → **Windows PowerShell (Admin)** veya **Terminal (Admin)** seçin
2. Şu komutu çalıştırın:

```powershell
# PostgreSQL servis adını bulun
Get-Service | Where-Object {$_.Name -like "*postgresql*"}

# Servisi başlatın (servis adını yukarıdaki komuttan öğrenin)
Start-Service postgresql-x64-15
# veya
Start-Service "PostgreSQL Server"
```

### Yöntem 3: Command Prompt ile

1. **Windows + R** → `cmd` → **Ctrl + Shift + Enter** (Yönetici olarak)
2. Şu komutu çalıştırın:

```cmd
net start postgresql-x64-15
```

## PostgreSQL Kurulu Değilse

Eğer PostgreSQL kurulu değilse:

1. **PostgreSQL İndir**: https://www.postgresql.org/download/windows/
2. **PostgreSQL Installer** indirin ve kurun
3. Kurulum sırasında:
   - Port: `5432` (varsayılan)
   - Superuser password: Güçlü bir şifre belirleyin (unutmayın!)
   - Locale: `Turkish, Turkey` veya `English, United States`

## Servis Durumunu Kontrol Etme

PowerShell'de:
```powershell
Get-Service | Where-Object {$_.Name -like "*postgresql*"}
```

Çıktıda **Status** sütununda **Running** görünmeli.

## pgAdmin'de Tekrar Deneme

Servis başladıktan sonra:

1. pgAdmin'deki hata mesajını kapatın (X butonuna tıklayın)
2. **Save** butonuna tıklayın (şifre kaydetmek için)
3. Sol panelde sunucuya çift tıklayarak bağlanmayı deneyin
4. Şifre istenirse, PostgreSQL kurulumunda belirlediğiniz şifreyi girin

## Alternatif: Docker ile PostgreSQL

Eğer PostgreSQL kurmak istemiyorsanız, Docker kullanabilirsiniz:

```bash
docker run --name postgres-portfoygo -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=trading_platform -p 5432:5432 -d postgres:15
```

## Bağlantı Testi

Servis başladıktan sonra, Command Prompt'ta test edin:

```cmd
psql -U postgres -h localhost
```

Veya pgAdmin'de tekrar bağlanmayı deneyin.

