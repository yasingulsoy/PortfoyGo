# PortfoyGo

Gerçek piyasa verileriyle çalışan **sanal yatırım simülasyonu**. Her kullanıcı 100.000 ₺ sanal bakiyeyle başlar; hisse, kripto, döviz ve emtia alıp satar, portföyünü takip eder ve liderlik tablosunda yarışır.

> PortfoyGo bir oyundur: işlemler sanal parayla yapılır ve hiçbir içerik yatırım tavsiyesi değildir.

## Özellikler

- **Dört piyasa:** Hisse, kripto, döviz ve emtia. Veri sağlayıcıları tek bir arayüzün arkasındadır; ortam değişkeniyle değiştirilebilir (varsayılan: Finnhub, CoinGecko, NosyAPI). Tüm fiyatlar tek, canlı bir USD/TRY kuruyla TL'ye çevrilir.
- **Güvenli alım-satım:** İşlem fiyatı her zaman **sunucuda** belirlenir. İstemcinin gönderdiği fiyat yok sayılır. Bakiye ve pozisyonlar satır kilitli tek bir transaction içinde güncellenir. Komisyon oranı %0,25.
- **Portföy:** Canlı değerleme, varlık dağılımı, pozisyon bazında kâr/zarar ve stop-loss emirleri.
- **İşlem geçmişi:** Güne göre gruplu liste, filtreler ve formül enjeksiyonuna karşı korumalı CSV dışa aktarımı.
- **Rekabet:** Tüm zamanlar ve haftalık liderlik tablosu, rozetler.
- **Hesap:** E-posta doğrulama ve şifre sıfırlama (deneme sınırlı kodlarla), rate limit.
- **Emirler:** Limit alış/satış, zarar durdur ve kâr al; limit alışta nakit bloke edilir, iptalde iade edilir.
- **Performans ve izleme listesi:** Saatlik/günlük portföy grafiği, favori varlıklar.
- **Yönetim paneli:** Ayrı uygulama; kullanıcılar, istatistikler, ban işlemleri ve önbellek yenileme.
- **Arayüz:** Açık/koyu tema, mobilde alt menü, klavye ve ekran okuyucu desteği.

## Teknoloji

| Katman | Kullanılanlar |
| --- | --- |
| Frontend ve Admin | Next.js 16 (App Router), React 19, Tailwind CSS v4, SWR, lightweight-charts |
| Backend | Express 4, PostgreSQL (`pg`), zod, helmet, express-rate-limit, node-cron, nodemailer |
| Geliştirme | npm workspaces, vitest, PGlite (gömülü yerel Postgres), GitHub Actions |

## Klasör yapısı

Proje bir **npm workspaces monorepo**'sudur:

```
frontend/            Kullanıcı uygulaması (Next.js, :3000)
  src/app/           Sayfalar: landing, piyasalar, portföy, işlemler, liderlik, haberler, profil, varlık detayı
  src/components/    Uygulama bileşenleri (layout, market, trade, portfolio, landing, command…)
  src/context/       Oturum ve portföy durumu
  src/hooks/         Piyasa verisi, izleme listesi ve oturum hook'ları
  src/lib/           Uygulamaya özgü API uçları ve sabitler
admin/               Yönetim paneli (ayrı Next.js uygulaması, :3001; yalnızca yönetici hesaplar)
backend/             Express API (:5001)
  src/providers/     Dış veri sağlayıcı arayüzleri ve adaptörleri (bkz. src/providers/README.md)
  src/routes|services|middleware
  migrations/        Sıralı SQL migration'ları (000_base … )
  test/              Entegrasyon testleri (bellek içi PGlite)
packages/shared/     Ortak paket (@portfoygo/shared): tasarım token'ları, UI bileşenleri,
                     biçimlendirme, API istemci çekirdeği
docs/                Yol haritası ve ürün dokümanları
```

Ortak paket alt yollarla kullanılır: `@portfoygo/shared/ui/Button`, `@portfoygo/shared/format`,
`@portfoygo/shared/api`, `@portfoygo/shared/styles.css`.

## Kurulum

Gereksinim: Node.js 20+ (PostgreSQL yalnızca gerçek veritabanıyla çalışırken gerekir).

```bash
npm install
```

Tek komut tüm paketleri kurar; ayrı ayrı `npm install` çalıştırmaya gerek yoktur.

### Ortam değişkenleri

Hiçbir API anahtarı koda gömülü değildir; tamamı ortam değişkenlerinden okunur.

| Uygulama | Örnek dosya | Kopyalanacak yer |
| --- | --- | --- |
| Frontend | `frontend/.env.example` | `frontend/.env.local` |
| Admin | `admin/.env.example` | `admin/.env.local` |
| Backend | `backend/.env.example` | `backend/.env` (`JWT_SECRET` zorunludur) |

### Veritabanı

Önce yedek alın, ardından migration'ları çalıştırın. Ayrıntılar [backend/migrations/README.md](backend/migrations/README.md) içinde.

```bash
npm run migrate
```

Yönetici hesabı oluşturmak için `ADMIN_EMAIL`, `ADMIN_USERNAME` ve `ADMIN_PASSWORD` değişkenlerini ayarlayın, ardından:

```bash
npm run create-admin -w @portfoygo/backend
```

### Geliştirme

| Komut | Açıklama |
| --- | --- |
| `npm run dev:local` | **Kurulumsuz:** gömülü yerel veritabanı + API + site + admin. Dış API'ler kapalı |
| `npm run dev` | API (`backend/.env` ile) + site + admin |
| `npm run dev:web` / `dev:admin` / `dev:api` | Tek bir uygulama |
| `npm run build` | Site ve admin production derlemesi |
| `npm run lint` | ESLint (site ve admin) |
| `npm run typecheck` | Tüm paketlerde tip kontrolü |
| `npm test` | Frontend birim testleri ve backend entegrasyon testleri |
| `npm run migrate` | Bekleyen migration'ları uygula (`-- --dry-run` ile önizle) |

#### Veritabanı ve API anahtarı olmadan çalıştırma

```bash
npm run dev:local
```

Bu komut şunları yapar:
- `backend/.localdb/` altında gömülü bir PostgreSQL (PGlite, `127.0.0.1:54329`) başlatır ve tüm migration'ları uygular.
- Örnek veri yükler: demo yönetici `demo@portfoygo.local`, 4 örnek kullanıcı, döviz kurları, 10 hisse ve 10 kripto fiyatı.
- Demo şifresini `backend/.localdb/demo-credentials.txt` dosyasına yazar (`LOCAL_DEMO_PASSWORD` ile belirlenebilir).
- `backend/.env` içindeki canlı veritabanını, API anahtarlarını ve SMTP'yi **kullanmaz**. Fiyatlar dakikada bir küçük adımlarla oynatılır. E-posta doğrulama ve sıfırlama kodları konsola yazılır.

Adresler: site <http://localhost:3000>, yönetim paneli <http://localhost:3001>, API <http://localhost:5001/api>.
Sıfırlamak için `npm run dev:local -w @portfoygo/backend -- --reset` kullanın.

## Güvenlik notları

- `.env` dosyalarını ve veritabanı dökümlerini (`*.dump`, `portfoygo.sql`) asla commit etmeyin; `.gitignore` bunları dışlar.
- Daha önce repoya girmiş anahtarlar **geçersiz sayılmalı ve yenilenmelidir**. Git geçmişindeki eski dosyalar için `git filter-repo` ile temizlik önerilir.

- Geliştirme yol haritası: [docs/GELISTIRME_YOL_HARITASI.md](docs/GELISTIRME_YOL_HARITASI.md)
- Mevcut yetenekler: [docs/SU_AN_NE_YAPILABIYOR.md](docs/SU_AN_NE_YAPILABIYOR.md)

### Oturumlar (çerez tabanlı)

- Giriş başarılı olunca backend JWT'yi gövdede **döndürmez**; `pg_session` adlı **httpOnly** çereze yazar
  (`SameSite=Lax`, `Path=/`, 7 gün; production'da veya `COOKIE_SECURE=1` ise `Secure`). JavaScript token'ı hiç
  görmez, localStorage'da token tutulmaz. Yanında hassas bilgi içermeyen `pg_auth=1` ipucu çerezi de yazılır;
  Next proxy'leri (`frontend/src/proxy.ts`, `admin/src/proxy.ts`) sayfa korumasında yalnızca buna bakar. Asıl yetki kontrolü her istekte backend'dedir.
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
