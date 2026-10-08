# PortfoyGo

Gerçek piyasa verileriyle çalışan **sanal yatırım simülasyonu**. Her kullanıcı 100.000 ₺ sanal bakiyeyle başlar; hisse, kripto, döviz ve emtia alıp satar, portföyünü takip eder ve liderlik tablosunda yarışır.

> PortfoyGo bir oyundur: işlemler sanal parayla yapılır ve hiçbir içerik yatırım tavsiyesi değildir.

## Özellikler

- **Dört piyasa:** Hisse (Finnhub), kripto (CoinGecko), döviz ve emtia (NosyAPI). Tüm fiyatlar tek, canlı bir USD/TRY kuruyla TL'ye çevrilir.
- **Güvenli alım-satım:** İşlem fiyatı her zaman **sunucuda** belirlenir. İstemcinin gönderdiği fiyat yok sayılır. Bakiye ve pozisyonlar satır kilitli tek bir transaction içinde güncellenir. Komisyon oranı %0,25.
- **Portföy:** Canlı değerleme, varlık dağılımı, pozisyon bazında kâr/zarar ve stop-loss emirleri.
- **İşlem geçmişi:** Güne göre gruplu liste, filtreler ve formül enjeksiyonuna karşı korumalı CSV dışa aktarımı.
- **Rekabet:** Tüm zamanlar ve haftalık liderlik tablosu, rozetler.
- **Hesap:** E-posta doğrulama ve şifre sıfırlama (deneme sınırlı kodlarla), rate limit.
- **Yönetim paneli:** Kullanıcılar, istatistikler, ban işlemleri ve önbellek yenileme.
- **Arayüz:** Açık/koyu tema, mobilde alt menü, klavye ve ekran okuyucu desteği.

## Teknoloji

| Katman | Kullanılanlar |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, SWR, lightweight-charts |
| Backend | Express 4, PostgreSQL (`pg`), zod, helmet, express-rate-limit, node-cron, nodemailer |

```
src/                 Next.js uygulaması
  app/               Sayfalar (App Router)
  components/ui/     Tasarım sistemi bileşenleri (Button, Card, Modal, Field, Tabs…)
  components/        Uygulama bileşenleri (layout, market, trade, portfolio…)
  context/           Auth ve portföy durumu
  hooks/             Piyasa verisi ve oturum hook'ları
  lib/               API istemcisi, biçimlendirme, sabitler
backend/             Express API
  src/routes|services|middleware
  migrations/        SQL şema migration'ları
```

## Kurulum

Gereksinimler: Node.js 20+ ve PostgreSQL 14+.

```bash
npm install
cd backend && npm install && cd ..
```

### Ortam değişkenleri

Hiçbir API anahtarı koda gömülü değildir; tamamı ortam değişkenlerinden okunur.

- **Frontend:** `.env.example` dosyasını `.env.local` olarak kopyalayın.
- **Backend:** `backend/.env.example` dosyasını `backend/.env` olarak kopyalayın. `JWT_SECRET` zorunludur; tanımlı değilse sunucu açılmaz.

### Veritabanı

Önce yedek alın, ardından migration'ı çalıştırın. Ayrıntılar [backend/migrations/README.md](backend/migrations/README.md) içinde.

```bash
cd backend && npm run migrate
```

Yönetici hesabı oluşturmak için `ADMIN_EMAIL`, `ADMIN_USERNAME` ve `ADMIN_PASSWORD` değişkenlerini ayarlayın, ardından:

```bash
cd backend && npm run create-admin
```

### Geliştirme

```bash
npm run dev
```

Bu komut backend'i (`:5001`) ve frontend'i (`:3000`) birlikte başlatır.

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Backend ve frontend birlikte |
| `npm run build` / `npm start` | Frontend production derlemesi ve sunucusu |
| `npm run lint` | ESLint |
| `npm run typecheck` | Frontend tip kontrolü |
| `cd backend && npm run typecheck` | Backend tip kontrolü |

## Güvenlik notları

- `.env` dosyalarını ve veritabanı dökümlerini (`*.dump`, `portfoygo.sql`) asla commit etmeyin; `.gitignore` bunları dışlar.
- Daha önce repoya girmiş anahtarlar **geçersiz sayılmalı ve yenilenmelidir**. Git geçmişindeki eski dosyalar için `git filter-repo` ile temizlik önerilir.

- Geliştirme yol haritası: [docs/GELISTIRME_YOL_HARITASI.md](docs/GELISTIRME_YOL_HARITASI.md)
- Mevcut yetenekler: [docs/SU_AN_NE_YAPILABIYOR.md](docs/SU_AN_NE_YAPILABIYOR.md)

### Oturumlar (çerez tabanlı)

- Giriş başarılı olunca backend JWT'yi gövdede **döndürmez**; `pg_session` adlı **httpOnly** çereze yazar
  (`SameSite=Lax`, `Path=/`, 7 gün; production'da veya `COOKIE_SECURE=1` ise `Secure`). JavaScript token'ı hiç
  görmez, localStorage'da token tutulmaz. Yanında hassas bilgi içermeyen `pg_auth=1` ipucu çerezi de yazılır;
  Next proxy'si (`src/proxy.ts`) sayfa korumasında yalnızca buna bakar. Asıl yetki kontrolü her istekte backend'dedir.
- **CSRF:** Çerezle doğrulanan `POST/PUT/PATCH/DELETE` isteklerinde `X-Requested-With: PortfoyGo` başlığı zorunludur
  (yoksa 403). Özel başlık CORS preflight'ını tetikler; preflight da `ALLOWED_ORIGINS` listesiyle korunur
  (`credentials: true`, asla `*`). `/api/auth/login` yalnızca `application/json` kabul eder.
- **Script / test:** `Authorization: Bearer <jwt>` hâlâ desteklenir ve CSRF kontrolünden muaftır. Token, giriş
  yanıtındaki `Set-Cookie: pg_session=...` değerinden alınır. Çerez kavanozu (cookie jar) kullanan istemciler
  durum değiştiren isteklerde yukarıdaki başlığı göndermelidir.
- **Oturum iptali:** `POST /api/auth/logout` bu tarayıcının çerezlerini siler. `POST /api/auth/logout-all`
  (Profil → Güvenlik → "Tüm cihazlardan çıkış yap") `users.token_version` değerini artırır; JWT'deki `tv`
  uyuşmayan tüm oturumlar 401 alır. Şifre sıfırlama da tüm oturumları kapatır.
  `migrations/002_sessions.sql` çalıştırılmadan yeni backend yayına alınmamalıdır.
- **Dağıtım:** Çerezler port ayırt etmediği için geliştirmede `localhost:3000` → `localhost:5001` sorunsuz çalışır
  (ikisine de `localhost` ile girin; `127.0.0.1` karıştırmayın). Production'da frontend ile API **aynı sitede**
  olmalıdır:
  - Alt alan adları: `app.portfoygo.com` + `api.portfoygo.com`, backend'de `COOKIE_DOMAIN=.portfoygo.com`
    ve `ALLOWED_ORIGINS=https://app.portfoygo.com`.
  - veya aynı origin: frontend build'inde `API_PROXY_TARGET=https://<api-adresi>` ve
    `NEXT_PUBLIC_API_URL=/api/backend`; Next, `/api/backend/*` isteklerini backend'e aktarır. Bu durumda
    backend tüm istekleri Next sunucusundan alır; rate limit için `TRUST_PROXY` ayarını gözden geçirin.
  - Farklı sitelerde (örn. `*.vercel.app` + `*.onrender.com`) `SameSite=Lax` çerezler gönderilmez; oturum çalışmaz.
