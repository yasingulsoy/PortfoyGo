# Kullanıcı Oluşturma Rehberi

> ⚠️ Bu script'ler `.env` içindeki veritabanına bağlanır. Production veritabanında çalıştırmadan önce iki kez düşünün.
> Kodda **varsayılan kullanıcı / şifre yoktur**; tüm bilgiler komut satırından veya env'den verilir.

## Tek kullanıcı

```bash
npm run create-user <username> <email> <password> [verified] [balance]
```

- `password`: 8-72 karakter (zorunlu). Güçlü ve benzersiz bir şifre kullanın.
- `verified`: Email doğrulandı mı? (`true`/`false`, varsayılan: `true`)
- `balance`: Başlangıç bakiyesi (varsayılan: `100000`)

Şifre ve şifre hash'i ekrana yazdırılmaz.

## Admin kullanıcı

```bash
ADMIN_EMAIL=admin@ornek.com ADMIN_USERNAME=admin_kullanici ADMIN_PASSWORD='en-az-12-karakterli-sifre' npm run create-admin
```

- Aynı email ile kayıtlı kullanıcı varsa admin yapılır ve şifresi güncellenir.
- Kullanıcı adı eşleşip email'i farklı olan bir hesap **admin yapılmaz**.

## Test kullanıcıları (sadece yerel geliştirme)

```bash
npm run create-users                      # rastgele şifreler üretir ve bir kez yazdırır
TEST_USER_PASSWORD='...' npm run create-users   # ortak şifre (en az 12 karakter)
```

`NODE_ENV=production` iken çalışmaz; sadece `@example.com` adresleri kullanılır.

## SQL ile (manuel)

`createUser.sql` içindeki `password_hash` alanına bcrypt hash'i koymanız gerekir. Düz metin şifreyi
SQL dosyasına veya repoya yazmayın.
