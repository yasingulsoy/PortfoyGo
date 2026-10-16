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
| Geliştirme | npm workspaces, vitest, Playwright, PGlite (gömülü yerel Postgres), pino, Docker, GitHub Actions |

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
| `npm run e2e` / `e2e:ui` | Playwright uçtan uca testleri (çalışan `dev:local` yığınına karşı) |

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

**Hızlı giriş:** Yerel veritabanıyla çalışırken giriş sayfalarında (site ve yönetim paneli) bir "Hızlı giriş" bölümü çıkar. Yerel hesaplardan birine tıklamak yeterlidir; e-posta ve şifre gerekmez. Bu özellik yalnızca backend `localhost`/`127.0.0.1` üzerindeki bir veritabanına bağlıyken ve `NODE_ENV` production değilken açılır. Uzak veritabanında uç 404 döner ve bölüm görünmez. Kapatmak için `DEV_LOGIN=0` ayarlayın.
Sıfırlamak için `npm run dev:local -w @portfoygo/backend -- --reset` kullanın.

## Docker ile çalıştırma

Production derlemeleriyle tam yığın: PostgreSQL 16 + migration + API + site + yönetim paneli.
Build bağlamı repo köküdür (npm workspaces); her uygulamanın kendi `Dockerfile`'ı vardır.

```bash
cp .env.docker.example .env.docker      # JWT_SECRET ve POSTGRES_PASSWORD'ü mutlaka değiştirin
docker compose --env-file .env.docker up --build
```

| Servis | Ne yapar |
| --- | --- |
| `postgres` | `postgres:16-alpine`, veri `pgdata` volume'ünde; `pg_isready` sağlık kontrolü |
| `migrate` | API imajında `node dist/scripts/migrate.js` çalıştırır ve çıkar (postgres sağlıklı olunca) |
| `api` | `node dist/index.js` (:5001), root olmayan kullanıcı, `HEALTHCHECK` → `/healthz`; migrate başarıyla bitince başlar |
| `web` | Next.js `output: 'standalone'` (:3000) |
| `admin` | Next.js `output: 'standalone'` (:3001) |

- **`NEXT_PUBLIC_*` build sırasında gömülür.** Tarayıcının göreceği API adresi `.env.docker` içindeki
  `PUBLIC_API_URL` ile verilir; değiştirince `--build` ile yeniden derleyin. CSP `connect-src` de bu adresten üretilir.
- API compose'ta `NODE_ENV=production` çalışır: oturum çerezi `Secure` olur (Chrome/Firefox `http://localhost`'u
  güvenli sayar; Safari saymaz). Production'da localhost origin'leri normalde reddedilir; yerel yığın için
  `CORS_ALLOW_LOCALHOST=1` ile açıkça izin verilir — gerçek alan adlarında `0` yapın.
- Veritabanı boş başlar (örnek veri yok, hızlı giriş kapalı). İlk yönetici:
  ```bash
  docker compose --env-file .env.docker run --rm \
    -e ADMIN_EMAIL=admin@ornek.com -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='en-az-12-karakter' \
    migrate node dist/scripts/createAdminUser.js
  ```
- Piyasa verisi için `FINNHUB_API_KEY`, `DOVIZ`, `EMTIA` vb. anahtarları `.env.docker`'a ekleyin; SMTP yoksa e-posta
  doğrulama kodları gönderilemez.
- Tek imaj: `docker build -f backend/Dockerfile -t portfoygo-api .` (site/admin için `--build-arg NEXT_PUBLIC_API_URL=...`).
- Sıfırlamak için: `docker compose --env-file .env.docker down -v` (veritabanı volume'ü silinir).

## Sağlık uçları ve loglama

| Uç | Yanıt |
| --- | --- |
| `GET /healthz` | Süreç ayakta mı (veritabanına dokunmaz): `200 {"status":"ok"}` |
| `GET /readyz` | Veritabanında `SELECT 1` (2 sn zaman aşımı): `200 {"status":"ready","db_latency_ms":…}` ya da `503 {"status":"not_ready"}` |

Her iki uç da `/api` önekisizdir, rate limit dışındadır ve istek logunda görünmez. Eski `GET /api/health` duruyor.

**Loglama (pino):** Backend `src/utils/logger.ts` üzerinden yapılandırılmış log yazar.

- Production'da satır başına bir JSON nesnesi; geliştirmede (`NODE_ENV` production değilken, terminal TTY ise ya da
  `LOG_PRETTY=1`) okunabilir renkli çıktı (`pino-pretty`). `npm run dev:local` bunu otomatik açar; `LOG_PRETTY=0` JSON'a zorlar.
- `LOG_LEVEL`: `trace | debug | info | warn | error | fatal | silent` (varsayılan `info`; testlerde `silent`).
- **İstek kimliği:** Her yanıtta `X-Request-Id` başlığı vardır. İstemci geçerli bir kimlik gönderirse (UUID benzeri,
  8–128 karakter) o kullanılır, yoksa `crypto.randomUUID()` üretilir. İstek logları ve hata logları bu kimliği taşır
  (`reqId`); bir kullanıcı hatası bildirdiğinde loglarda bu değerle arayın.
- `Authorization`, `Cookie`, `Set-Cookie` başlıkları ve `password` alanları loglara `[REDACTED]` olarak yazılır;
  sorgu dizeleri loglanmaz.

**Güvenlik başlıkları (site ve admin):** Content-Security-Policy her sayfa isteğinde `src/proxy.ts` tarafından
**istek başına nonce** ile üretilir (ortak kurallar: `packages/shared/src/csp.ts`): `script-src 'self' 'nonce-…'
'strict-dynamic'` (satır içi betik yalnızca nonce'luysa çalışır; Next kendi betiklerine nonce'u otomatik ekler, kök
layout next-themes tema betiğine verir), `style-src 'self' 'unsafe-inline'` (React `style` öznitelikleri / grafikler),
`connect-src` = kendi origin + API origin'i (fetch + SSE), `img-src 'self' data: blob: https:` (haber görselleri),
`font-src 'self'` (next/font kendi sunucumuzdan), `frame-ancestors 'none'` + `X-Frame-Options: DENY` — OBS yayın
katmanı `/yayin/**` hariç (`frame-ancestors *`, çerçevelenebilir). `'unsafe-eval'` ve HMR websocket'i (`ws:`) yalnızca
geliştirmededir. Nonce'lu CSP nedeniyle tüm sayfalar dinamik render edilir. `next.config.ts` ayrıca
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` ve
(production'da) `Strict-Transport-Security` ekler. Yeni bir dış alan adına tarayıcıdan istek atılacak / betik
yüklenecekse `packages/shared/src/csp.ts`'e eklenmelidir.

**İki adımlı doğrulama ve KVKK:** Kullanıcılar Profil → Güvenlik'ten TOTP 2FA açar (QR + 10 kurtarma kodu);
girişte ikinci adım `POST /api/auth/login/2fa`. Anahtarlar `TOTP_ENC_KEY` ile şifreli saklanır (production'da zorunlu);
`ADMIN_REQUIRE_2FA` (production'da varsayılan açık) yönetim API'sini 2FA'lı yöneticilere sınırlar. Profil → Hesap ve
veriler: `GET /api/me/export` (JSON veri kopyası, saatte 3) ve `POST /api/me/delete` (anonimleştirerek silme). Yerel
hızlı giriş (`/api/auth/dev-login`, yalnızca yerel DB) 2FA adımını atlar.

## Uçtan uca testler (Playwright)

Testler `e2e/` klasöründedir ve **zaten çalışan** yerel yığına karşı koşar (sunucu başlatmaz):

```bash
npx playwright install chromium   # ilk sefer
npm run dev:local                 # 1. terminal: PGlite + API + site + admin
npm run e2e                       # 2. terminal (arayüzle: npm run e2e:ui, rapor: npm run e2e:report)
```

| Test | Kapsam |
| --- | --- |
| `auth.setup.ts` | Giriş sayfasındaki "Hızlı giriş" ile demo hesabı → panel; oturumu `e2e/.auth/demo.json`'a kaydeder |
| `guest.spec.ts` | Misafir açılış sayfası ve `/login` bağlantısı |
| `markets.spec.ts` | Piyasalar tablosu → AAPL varlık sayfası → fiyat grafiği |
| `trade.spec.ts` | Piyasalardan 1.000 ₺'lik hisse alımı → portföyde pozisyon → tamamını geri satış |
| `leaderboard.spec.ts` | Liderlik tablosu "Sezon" sekmesi |
| `admin.spec.ts` | Yönetim paneli (:3001) genel bakış, demo yönetici |

- Testler yalnızca yerel veritabanında çalışır (hızlı giriş uzak veritabanında kapalıdır). Alım-satım testi demo hesabının
  elinde olmayan bir hisseyi seçip aynı miktarı geri sattığı için tekrar çalıştırılabilir; işlem geçmişine kayıt ekler.
- Adresler `E2E_BASE_URL`, `E2E_ADMIN_URL`, `E2E_API_URL` ile değiştirilebilir. Başarısız testlerin iz (trace),
  ekran görüntüsü ve videoları `e2e/test-results/`, HTML rapor `e2e/playwright-report/` altındadır.
- CI'da ayrı bir `e2e` işi yığını arka planda başlatır, `/healthz`, `/readyz` ve sayfaları bekler, testleri koşar ve
  başarısızlıkta raporu artifact olarak yükler.

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
