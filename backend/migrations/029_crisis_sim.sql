-- =============================================================================
-- 029_crisis_sim.sql — Kriz Simülatörü (Oyun Merkezi, /oyun/kriz)
--
-- * İDEMPOTENT: birden fazla kez çalıştırılabilir (CREATE … IF NOT EXISTS, ON CONFLICT DO NOTHING).
-- * İçinde BEGIN/COMMIT YOKTUR (migration runner her dosyayı tek transaction'da çalıştırır).
-- * Yalnızca YENİ tablo / indeks / tohum satırı ekler; mevcut tablolara ve verilere dokunmaz.
--
-- Sıra tabanlı (turn-based) kriz oyunu: oyuncu 100.000 TL sanal portföyle bir krizi hafta hafta / ay ay yaşar;
-- her turda gündemi okur (o turun getirisini görmeden) ve dağılımını değiştirir; onaylayınca turun getirileri açılır.
--
-- 1) crisis_scenarios: senaryo meta verisi (yönetici düzenler — yönetim paneli /crisis; denetim 'crisis.*').
--    assets   = [{key, label, description}] — key ∈ hisse | tahvil | altin | nakit | usd | kripto (hisse, tahvil, nakit zorunlu).
--    stylized = TRUE → arayüzde "Stilize, yaklaşık — eğitim amaçlı" etiketi + metodoloji notu gösterilir.
--    version  = getiriler / tur yapısı değişince artar; sıralama yalnızca güncel sürümün denemelerini karşılaştırır.
-- 2) crisis_turns: tur başına dönem etiketi, manşet, gündem (karar ÖNCESİ gösterilir), "ne oldu" (karar SONRASI)
--    ve varlık sınıfı başına TL bazlı dönem getirisi (yüzde) — returns = {"hisse": -9.8, "nakit": 0.7, …}.
-- 3) crisis_attempts: oyuncu denemesi. Başlarken senaryonun o anki hali snapshot JSONB'ye kopyalanır (yönetici
--    düzenlemesi devam eden oyunu bozmaz). Kullanıcı + senaryo başına tek aktif deneme (kısmi benzersiz indeks).
-- 4) crisis_attempt_turns: oynanan her tur (karar öncesi ağırlıklar, yeni dağılım, işlem tutarı / maliyeti,
--    tur başı / sonu değer, açılan getiriler). PK (attempt_id, turn_no) → aynı tur iki kez oynanamaz.
--
-- TOHUM: 4 senaryo (2008 Küresel Finans Krizi, 2020 Pandemi Şoku, 2022 Faiz Şoku, 2018 TL Kur Şoku), 12–16 tur.
-- Getiriler STİLİZE ve YAKLAŞIKTIR: lisanslı tarihsel veri değildir; kamuya açık, yaygın bilinen büyüklüklerden
-- (zirveden dibe düşüş, toparlanma biçimi, kur hareketi) eğitim amacıyla türetilmiştir. Tüm getiriler TL bazındadır
-- (yabancı para varlıklara USD/TL değişimi dahil). Pazarlamada "gerçek veri" iddiasından önce lisanslı veriyle
-- doğrulanmalıdır (docs/YAYIN_KONTROL_LISTESI.md). Turlar yalnızca senaryonun hiç turu yoksa eklenir (yöneticinin
-- düzenlemeleri yeniden çalıştırmada ezilmez).
-- KVKK: crisis_attempts (+ turları) "Verilerimi indir"e dahildir; hesap silinince silinir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Senaryolar
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL,
  title VARCHAR(80) NOT NULL,
  -- Kart ve brifingde gösterilen dönem, ör. "Eylül 2008 – Aralık 2009"
  period_label VARCHAR(60) NOT NULL,
  summary VARCHAR(300) NOT NULL,
  -- Kriz öncesi durum (başlangıç dağılımı seçilirken okunur)
  briefing TEXT NOT NULL,
  -- Metodoloji notu (stilize verinin nasıl üretildiği, varlık tanımları, para birimi bazı)
  methodology TEXT NOT NULL,
  difficulty VARCHAR(8) NOT NULL DEFAULT 'orta',
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  stylized BOOLEAN NOT NULL DEFAULT TRUE,
  source VARCHAR(200) NOT NULL,
  license_note VARCHAR(300) NOT NULL,
  -- Senaryo dönemindeki yaklaşık TÜFE değişimi (%); reel getiri için (NULL → gösterilmez)
  inflation_pct NUMERIC(8, 2),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT crisis_scenarios_slug_unique UNIQUE (slug),
  CONSTRAINT crisis_scenarios_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  CONSTRAINT crisis_scenarios_difficulty_check CHECK (difficulty IN ('kolay', 'orta', 'zor')),
  CONSTRAINT crisis_scenarios_assets_check CHECK (jsonb_typeof(assets) = 'array'),
  CONSTRAINT crisis_scenarios_text_check CHECK (char_length(briefing) <= 3000 AND char_length(methodology) <= 4000),
  CONSTRAINT crisis_scenarios_version_check CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_crisis_scenarios_published ON crisis_scenarios (published, sort_order);

-- -----------------------------------------------------------------------------
-- 2. Turlar
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_turns (
  scenario_id UUID NOT NULL REFERENCES crisis_scenarios(id) ON DELETE CASCADE,
  turn_no SMALLINT NOT NULL,
  period_label VARCHAR(60) NOT NULL,
  headline VARCHAR(120) NOT NULL,
  narrative TEXT NOT NULL,
  outcome TEXT NOT NULL,
  returns JSONB NOT NULL,
  PRIMARY KEY (scenario_id, turn_no),
  CONSTRAINT crisis_turns_no_check CHECK (turn_no BETWEEN 1 AND 20),
  CONSTRAINT crisis_turns_text_check CHECK (char_length(narrative) <= 1000 AND char_length(outcome) <= 1000),
  CONSTRAINT crisis_turns_returns_check CHECK (jsonb_typeof(returns) = 'object')
);

-- -----------------------------------------------------------------------------
-- 3. Denemeler
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Oynanmış senaryo silinemez (servis 409 CRISIS_HAS_PLAYS döner; burada da korunur)
  scenario_id UUID NOT NULL REFERENCES crisis_scenarios(id) ON DELETE RESTRICT,
  scenario_version INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  -- Başlangıçta kopyalanan senaryo + turlar (getiriler dahil; istemciye ASLA bütünüyle gönderilmez)
  snapshot JSONB NOT NULL,
  turns_total SMALLINT NOT NULL,
  -- Tamamlanan tur sayısı (0 = henüz başlangıç dağılımı seçilmedi)
  turn_no SMALLINT NOT NULL DEFAULT 0,
  start_value NUMERIC(16, 2) NOT NULL,
  value NUMERIC(18, 4) NOT NULL,
  -- Varlık sınıfı başına TL tutar: {"nakit": 100000}
  holdings JSONB NOT NULL,
  costs_total NUMERIC(16, 4) NOT NULL DEFAULT 0,
  -- Bitince: risk ayarlı skor (getiri − 0,5 × en büyük düşüş), not, özet metrikler ve tam sonuç
  score NUMERIC(10, 2),
  grade VARCHAR(1),
  total_return_pct NUMERIC(10, 4),
  max_drawdown_pct NUMERIC(10, 4),
  result JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT crisis_attempts_status_check CHECK (status IN ('active', 'finished', 'abandoned')),
  CONSTRAINT crisis_attempts_turn_check CHECK (turn_no >= 0 AND turn_no <= turns_total),
  CONSTRAINT crisis_attempts_value_check CHECK (value >= 0)
);

-- Kullanıcı + senaryo başına tek aktif deneme
CREATE UNIQUE INDEX IF NOT EXISTS uq_crisis_attempts_active ON crisis_attempts (user_id, scenario_id) WHERE status = 'active';
-- Senaryo sıralaması (güncel sürüm, en iyi skor)
CREATE INDEX IF NOT EXISTS idx_crisis_attempts_board ON crisis_attempts (scenario_id, scenario_version, score DESC) WHERE status = 'finished';
-- Kullanıcının denemeleri / günlük başlatma sınırı
CREATE INDEX IF NOT EXISTS idx_crisis_attempts_user ON crisis_attempts (user_id, started_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Oynanan turlar
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crisis_attempt_turns (
  attempt_id UUID NOT NULL REFERENCES crisis_attempts(id) ON DELETE CASCADE,
  turn_no SMALLINT NOT NULL,
  -- "Hiçbir şey yapma": işlem yok, maliyet yok
  held BOOLEAN NOT NULL DEFAULT FALSE,
  -- Karar öncesi (önceki turların getirileriyle kaymış) ağırlıklar ve karar sonrası dağılım (0–1)
  weights_before JSONB NOT NULL,
  allocation JSONB NOT NULL,
  -- İşlem tutarı = alınan + satılan (TL); maliyet = işlem tutarı × oran (ilk tur ücretsiz)
  traded NUMERIC(18, 4) NOT NULL DEFAULT 0,
  cost NUMERIC(16, 4) NOT NULL DEFAULT 0,
  value_before NUMERIC(18, 4) NOT NULL,
  value_after NUMERIC(18, 4) NOT NULL,
  returns JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, turn_no),
  CONSTRAINT crisis_attempt_turns_no_check CHECK (turn_no BETWEEN 1 AND 20)
);

-- -----------------------------------------------------------------------------
-- 5. Tohum: 4 stilize senaryo (yayında). Turlar yalnızca senaryonun hiç turu yoksa eklenir.
-- -----------------------------------------------------------------------------
INSERT INTO crisis_scenarios
  (slug, title, period_label, summary, briefing, methodology, difficulty, assets, inflation_pct, sort_order, stylized, source, license_note, published)
SELECT v.slug, v.title, v.period_label, v.summary, v.briefing, v.methodology, v.difficulty, v.assets, v.inflation_pct, v.sort_order, TRUE,
       'PortfoyGo stilize senaryo (kamuya açık olayların yaklaşık büyüklükleri)',
       'Lisanslı veri içermez; PortfoyGo tarafından eğitim amacıyla üretilmiş yaklaşık değerler.',
       TRUE
  FROM (VALUES
  ('kuresel-finans-krizi-2008', '2008 Küresel Finans Krizi', 'Eylül 2008 – Aralık 2009', 'Lehman Brothers''ın çöküşünden 2009''daki toparlanmaya: bankacılık krizi, dip ve dönüş. Panikte satmak mı, sabretmek mi?',
   'Eylül 2008''in ilk haftası. ABD''de konut fiyatları bir yıldır düşüyor; mortgage kaynaklı kayıplar büyük yatırım bankalarını zorluyor. Mart''ta Bear Stearns, Fed desteğiyle JPMorgan''a satılmıştı. 7 Eylül''de ABD hükümeti konut kredisi devleri Fannie Mae ve Freddie Mac''i kontrol altına aldı. Türkiye''de politika faizi yaklaşık %17, mevduat faizleri yüksek; dolar 1,20 TL civarında. 100.000 TL''lik sanal portföyünü nasıl dağıtacaksın?',
   'Stilize, yaklaşık — eğitim amaçlı. Bu senaryodaki tur getirileri lisanslı bir tarihsel veri setinden alınmamıştır: kamuya açık ve yaygın bilinen büyüklükler (zirveden dibe düşüşler, toparlanmanın biçimi, kur hareketleri) esas alınarak PortfoyGo tarafından yaklaşık olarak oluşturulmuştur. Tur getirileri gerçek dönem getirilerinden farklıdır; tarihî bir kaydın ya da yatırım tavsiyesinin yerine geçmez. Tüm getiriler TL bazındadır: yabancı para cinsinden varlıklara USD/TL kurundaki değişim dahildir; nakit/mevduat dönemin yaklaşık TL mevduat faizini yansıtır. Vergi, stopaj ve fon giderleri yok sayılmıştır. Varlıklar: Hisse = küresel gelişmiş piyasa hisse endeksinin TL karşılığı; Tahvil = küresel yatırım yapılabilir tahvil endeksinin TL karşılığı; Altın = ons altının TL karşılığı; USD = USD/TL kurundaki değişim; Nakit = TL mevduat. Bu dönemde kripto para yoktu. Dolar bazında küresel hisseler zirveden dibe yarıdan fazla değer kaybetti; TL’nin aynı dönemdeki değer kaybı, TL bazlı yatırımcı için bu düşüşün bir kısmını dengeledi.',
   'zor', '[{"key":"hisse","label":"Hisse senedi (küresel)","description":"Küresel gelişmiş piyasa hisse endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"tahvil","label":"Tahvil (küresel)","description":"Küresel yatırım yapılabilir tahvil endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"altin","label":"Altın","description":"Ons altın; TL karşılığı (kur etkisi dahil)."},{"key":"nakit","label":"Nakit / mevduat (TL)","description":"TL vadeli mevduat; dönemin yaklaşık faiziyle."},{"key":"usd","label":"USD (döviz)","description":"Dolar nakit; getirisi USD/TL kurundaki değişimdir."}]'::jsonb, 10, 10),
  ('pandemi-soku-2020', '2020 Pandemi Şoku', 'Şubat – Aralık 2020', 'Tarihin en hızlı çöküşlerinden biri ve ardından gelen hızlı toparlanma. Panik anında soğukkanlı kalabilecek misin?',
   'Şubat 2020''nin ortası. Küresel hisseler rekor seviyede; Çin''de yayılan yeni koronavirüs salgını haberlerde ama piyasalar şimdilik sakin. Türkiye''de politika faizi %10,75; dolar 6,05 TL civarında. Bitcoin 10.000 doların üzerinde. 100.000 TL''lik sanal portföyünü nasıl dağıtacaksın?',
   'Stilize, yaklaşık — eğitim amaçlı. Bu senaryodaki tur getirileri lisanslı bir tarihsel veri setinden alınmamıştır: kamuya açık ve yaygın bilinen büyüklükler (zirveden dibe düşüşler, toparlanmanın biçimi, kur hareketleri) esas alınarak PortfoyGo tarafından yaklaşık olarak oluşturulmuştur. Tur getirileri gerçek dönem getirilerinden farklıdır; tarihî bir kaydın ya da yatırım tavsiyesinin yerine geçmez. Tüm getiriler TL bazındadır: yabancı para cinsinden varlıklara USD/TL kurundaki değişim dahildir; nakit/mevduat dönemin yaklaşık TL mevduat faizini yansıtır. Vergi, stopaj ve fon giderleri yok sayılmıştır. Varlıklar: Hisse = küresel gelişmiş piyasa hisse endeksinin TL karşılığı; Tahvil = küresel yatırım yapılabilir tahvil endeksinin TL karşılığı; Altın = ons altının TL karşılığı; USD = USD/TL kurundaki değişim; Kripto = Bitcoin’in TL karşılığı; Nakit = TL mevduat.',
   'orta', '[{"key":"hisse","label":"Hisse senedi (küresel)","description":"Küresel gelişmiş piyasa hisse endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"tahvil","label":"Tahvil (küresel)","description":"Küresel yatırım yapılabilir tahvil endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"altin","label":"Altın","description":"Ons altın; TL karşılığı (kur etkisi dahil)."},{"key":"nakit","label":"Nakit / mevduat (TL)","description":"TL vadeli mevduat; dönemin yaklaşık faiziyle."},{"key":"usd","label":"USD (döviz)","description":"Dolar nakit; getirisi USD/TL kurundaki değişimdir."},{"key":"kripto","label":"Kripto (Bitcoin)","description":"Bitcoin; TL karşılığı. Çok yüksek oynaklık."}]'::jsonb, 10, 20),
  ('faiz-soku-2022', '2022 Faiz Şoku', 'Ocak – Aralık 2022', 'Enflasyonla mücadele eden merkez bankaları faizleri hızla artırdı: hisse ve tahvil birlikte düştü, kripto çöktü, TL’de enflasyon %64’ü aştı.',
   'Ocak 2022. ABD''de enflasyon 40 yılın en yüksek seviyesinde; Fed faiz artırımlarına başlamaya hazırlanıyor. Kripto paralar Kasım 2021 zirvesinden geriledi. Türkiye''de Aralık 2021''deki sert kur dalgalanmasının ardından kur korumalı mevduat açıklandı; dolar 13,3 TL civarında, yıllık enflasyon %36''nın üzerinde. 100.000 TL’lik sanal portföyünü nasıl dağıtacaksın?',
   'Stilize, yaklaşık — eğitim amaçlı. Bu senaryodaki tur getirileri lisanslı bir tarihsel veri setinden alınmamıştır: kamuya açık ve yaygın bilinen büyüklükler (zirveden dibe düşüşler, toparlanmanın biçimi, kur hareketleri) esas alınarak PortfoyGo tarafından yaklaşık olarak oluşturulmuştur. Tur getirileri gerçek dönem getirilerinden farklıdır; tarihî bir kaydın ya da yatırım tavsiyesinin yerine geçmez. Tüm getiriler TL bazındadır: yabancı para cinsinden varlıklara USD/TL kurundaki değişim dahildir; nakit/mevduat dönemin yaklaşık TL mevduat faizini yansıtır. Vergi, stopaj ve fon giderleri yok sayılmıştır. Varlıklar: Hisse = küresel gelişmiş piyasa hisse endeksinin TL karşılığı; Tahvil = küresel yatırım yapılabilir tahvil endeksinin TL karşılığı; Altın = ons altının TL karşılığı; USD = USD/TL kurundaki değişim; Kripto = Bitcoin’in TL karşılığı; Nakit = TL mevduat. Dolar bazında küresel hisseler ve tahviller 2022’yi çift haneli kayıpla kapattı; TL’nin değer kaybı TL bazlı getirileri yukarı taşıdı ama aynı dönemde TÜFE yaklaşık %64 arttı (reel getiriye bakın).',
   'orta', '[{"key":"hisse","label":"Hisse senedi (küresel)","description":"Küresel gelişmiş piyasa hisse endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"tahvil","label":"Tahvil (küresel)","description":"Küresel yatırım yapılabilir tahvil endeksi; TL karşılığı (kur etkisi dahil)."},{"key":"altin","label":"Altın","description":"Ons altın; TL karşılığı (kur etkisi dahil)."},{"key":"nakit","label":"Nakit / mevduat (TL)","description":"TL vadeli mevduat; dönemin yaklaşık faiziyle."},{"key":"usd","label":"USD (döviz)","description":"Dolar nakit; getirisi USD/TL kurundaki değişimdir."},{"key":"kripto","label":"Kripto (Bitcoin)","description":"Bitcoin; TL karşılığı. Çok yüksek oynaklık."}]'::jsonb, 64, 30),
  ('tl-kur-soku-2018', '2018 TL Kur Şoku', 'Ocak 2018 – Şubat 2019', 'TL’nin hızla değer kaybettiği, faizin %24’e çıktığı ve kurun ardından kısmen geri çekildiği dönem: dövize kaçmak mı, sabretmek mi?',
   'Ocak 2018. Türkiye ekonomisi 2017''yi güçlü büyümeyle kapattı ama cari açık ve enflasyon (yaklaşık %12) yüksek; şirketlerin döviz borcu büyük. Dolar 3,80 TL civarında, Merkez Bankası’nın fiilî fonlama faizi %12,75. Borsa İstanbul rekor seviyeye yakın. 100.000 TL’lik sanal portföyünü nasıl dağıtacaksın?',
   'Stilize, yaklaşık — eğitim amaçlı. Bu senaryodaki tur getirileri lisanslı bir tarihsel veri setinden alınmamıştır: kamuya açık ve yaygın bilinen büyüklükler (zirveden dibe düşüşler, toparlanmanın biçimi, kur hareketleri) esas alınarak PortfoyGo tarafından yaklaşık olarak oluşturulmuştur. Tur getirileri gerçek dönem getirilerinden farklıdır; tarihî bir kaydın ya da yatırım tavsiyesinin yerine geçmez. Tüm getiriler TL bazındadır: yabancı para cinsinden varlıklara USD/TL kurundaki değişim dahildir; nakit/mevduat dönemin yaklaşık TL mevduat faizini yansıtır. Vergi, stopaj ve fon giderleri yok sayılmıştır. Bu senaryo yurt içi odaklıdır. Varlıklar: Hisse = Borsa İstanbul (BIST 100 benzeri sepet, TL); Tahvil = orta vadeli TL devlet tahvili fonu (TL); Altın = ons altının TL karşılığı; USD = USD/TL kurundaki değişim; Nakit = TL mevduat.',
   'zor', '[{"key":"hisse","label":"Hisse senedi (Borsa İstanbul)","description":"BIST 100 benzeri yurt içi hisse sepeti; TL."},{"key":"tahvil","label":"Tahvil (TL devlet)","description":"Orta vadeli TL devlet tahvili fonu; TL."},{"key":"altin","label":"Altın","description":"Ons altın; TL karşılığı (kur etkisi dahil)."},{"key":"nakit","label":"Nakit / mevduat (TL)","description":"TL vadeli mevduat; dönemin yaklaşık faiziyle."},{"key":"usd","label":"USD (döviz)","description":"Dolar nakit; getirisi USD/TL kurundaki değişimdir."}]'::jsonb, 22, 40)
  ) AS v(slug, title, period_label, summary, briefing, methodology, difficulty, assets, inflation_pct, sort_order)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO crisis_turns (scenario_id, turn_no, period_label, headline, narrative, outcome, returns)
SELECT s.id, v.turn_no, v.period_label, v.headline, v.narrative, v.outcome, v.returns
  FROM (VALUES
  ('kuresel-finans-krizi-2008', 1, 'Eylül 2008, 2. hafta', 'Fannie Mae ve Freddie Mac devletin kontrolünde',
   'Hafta sonu ABD Hazinesi, konut kredisi piyasasının iki dev kuruluşu Fannie Mae ve Freddie Mac''i kayyum yönetimine aldı. Gözler şimdi ağır mortgage kayıpları taşıyan Lehman Brothers''ta: bankanın hisseleri sert düşüyor, alıcı arayışı sürüyor.',
   'Kurtarma haberiyle haftaya yükselişle başlayan piyasalar, Lehman endişesiyle kazançlarının çoğunu geri verdi. Altın, dolar karşısında geriledi.',
   '{"hisse":1.2,"tahvil":1.2,"altin":-4.2,"nakit":0.3,"usd":0.8}'::jsonb),
  ('kuresel-finans-krizi-2008', 2, 'Eylül 2008, 3. hafta', 'Lehman için hafta sonu pazarlığı',
   'New York Fed''deki hafta sonu toplantılarında Lehman Brothers için alıcı bulunamadığı konuşuluyor. Merrill Lynch''in de bir alıcıyla görüştüğü, sigorta devi AIG''nin nakit sıkıntısı çektiği haberleri geliyor.',
   'Lehman Brothers 15 Eylül''de iflas başvurusu yaptı; Merrill Lynch, Bank of America''ya satıldı. Fed, AIG''ye büyük bir kredi açarak şirketin çoğunluk hissesini devraldı; bir para piyasası fonunun pay değeri 1 doların altına düştü. Hafta sonunda kapsamlı bir kurtarma planı sinyaliyle hisseler sert yükseldi; altın güvenli liman talebiyle tırmandı.',
   '{"hisse":0.5,"tahvil":1.8,"altin":15.7,"nakit":0.3,"usd":2.1}'::jsonb),
  ('kuresel-finans-krizi-2008', 3, 'Eylül sonu – Ekim 2008 başı', '700 milyar dolarlık kurtarma planı Kongre’de',
   'ABD Hazinesi, bankaların sorunlu varlıklarını satın almak için 700 milyar dolarlık bir paket (TARP) önerdi; paketin Kongre''den geçip geçmeyeceği belirsiz. Büyük tasarruf bankası Washington Mutual''ın batma riski konuşuluyor.',
   'Washington Mutual kapatıldı; bu, ABD tarihinin en büyük banka iflası oldu. Temsilciler Meclisi paketi 29 Eylül''de reddedince ABD hisseleri tek günde yaklaşık %9 düştü; değiştirilen paket 3 Ekim''de yasalaştı ama satışlar durmadı. TL değer kaybetmeye başladı.',
   '{"hisse":-9.8,"tahvil":4.6,"altin":0.5,"nakit":0.7,"usd":4}'::jsonb),
  ('kuresel-finans-krizi-2008', 4, 'Ekim 2008, 2. hafta', 'Kredi piyasaları dondu',
   'Bankalar birbirine borç vermekten kaçınıyor ve kredi piyasaları neredeyse durdu. Avrupa’da da bankalar devlet desteğiyle ayakta tutuluyor; İzlanda bankacılık sistemi çöküşün eşiğinde.',
   '8 Ekim''de büyük merkez bankaları eşgüdümlü faiz indirimi yaptı; yine de küresel hisseler tarihin en kötü haftalarından birini yaşadı (dolar bazında yaklaşık %20 düşüş). Gelişmekte olan ülkelerden para çıkışıyla dolar/TL hızla yükseldi.',
   '{"hisse":-10.7,"tahvil":8.8,"altin":13.2,"nakit":0.4,"usd":10.1}'::jsonb),
  ('kuresel-finans-krizi-2008', 5, 'Ekim 2008, 3–4. hafta', 'Avrupa bankalara sermaye koyuyor',
   'Hafta sonu Avrupa hükümetleri bankalara sermaye ve borç garantisi sağlayan planlar açıkladı; ABD de bankalara doğrudan sermaye koymaya hazırlanıyor. Oynaklık rekor düzeyde.',
   '13 Ekim''de ABD hisseleri tek günde %11''in üzerinde yükseldi, ardından düşüş yeniden başladı. Dolar/TL 1,70''e yaklaştı; TL''nin değer kaybı, TL bazlı yatırımcı için dövizli varlıkların değerini artırdı.',
   '{"hisse":13.9,"tahvil":16.6,"altin":1.7,"nakit":0.7,"usd":19}'::jsonb),
  ('kuresel-finans-krizi-2008', 6, 'Ekim sonu – Kasım 2008', 'Faizler düşüyor, resesyon kapıda',
   'Fed''in faizi %1''e indirmesi bekleniyor; IMF ödeme güçlüğü çeken ülkelere destek programları hazırlıyor. ABD''de başkanlık seçimine günler kaldı ve ekonomik veriler resesyonun derinleştiğini gösteriyor.',
   'Fed faizi %1''e indirdi. Kasım ortasında hisseler yeni dipler gördü; Citigroup''a hükümet desteği ve Fed''in mortgage tahvili alım programını açıklamasıyla ay sonuna doğru toparlandı. Dolar/TL bir miktar geriledi.',
   '{"hisse":-5.5,"tahvil":-4.8,"altin":3,"nakit":1.6,"usd":-7.1}'::jsonb),
  ('kuresel-finans-krizi-2008', 7, 'Aralık 2008', 'Fed faizi sıfıra yaklaştırıyor',
   'ABD''de istihdam kayıpları hızlanıyor ve Fed''in faizi neredeyse sıfıra indirmesi bekleniyor. Türkiye''de Merkez Bankası faiz indirimlerine başladı.',
   'Fed politika faizini %0–0,25 aralığına indirdi. Bernard Madoff''un yıllardır süren dev bir sahtekârlık düzeni yürüttüğü ortaya çıktı. Hisseler yatay seyretti; tahviller ve altın değer kazandı.',
   '{"hisse":-0.1,"tahvil":2.2,"altin":4.4,"nakit":1.5,"usd":-2.2}'::jsonb),
  ('kuresel-finans-krizi-2008', 8, 'Ocak 2009', 'Yeni yıl, eski sorunlar',
   'ABD''de yeni başkan göreve başlamak üzere ve büyük bir teşvik paketi hazırlanıyor. Bankaların bilançolarındaki kayıplarla ilgili endişeler sürüyor.',
   'İngiltere ikinci bir banka kurtarma paketi açıkladı; banka hisselerindeki satışla küresel endeksler yeniden düştü. TL’deki değer kaybı yeniden hızlandı, altın yükselişini sürdürdü.',
   '{"hisse":-1.5,"tahvil":6.2,"altin":15,"nakit":1.3,"usd":8.1}'::jsonb),
  ('kuresel-finans-krizi-2008', 9, 'Şubat 2009', 'Bankalar devletleştirilecek mi?',
   'ABD Kongresi yaklaşık 787 milyar dolarlık teşvik paketini görüşüyor. Büyük bankaların devletleştirilebileceği tartışılıyor; yatırımcıların güveni zayıf.',
   'Teşvik yasası 17 Şubat''ta imzalandı ama hisseler son 12 yılın en düşük seviyelerine indi. Altın ons başına 1.000 doları kısa süreliğine aştı.',
   '{"hisse":-7,"tahvil":2.6,"altin":5.6,"nakit":1.1,"usd":3.6}'::jsonb),
  ('kuresel-finans-krizi-2008', 10, 'Mart 2009, 1–2. hafta', 'Ekonomide karanlık tablo',
   'Ocak''ta ABD''de yarım milyondan fazla kişi işini kaybetmişti; Şubat verisinin de kötü gelmesi bekleniyor. Hisseler 12 yılın en düşük seviyesinde ve pek çok yorumcu düşüşün süreceğini düşünüyor.',
   'Küresel hisseler 9 Mart''ta krizin dibini gördü. Ertesi gün Citigroup''un yılın ilk iki ayında kâr ettiğini açıklamasıyla güçlü bir toparlanma başladı.',
   '{"hisse":-0.4,"tahvil":1.2,"altin":-0.8,"nakit":0.5,"usd":0.6}'::jsonb),
  ('kuresel-finans-krizi-2008', 11, 'Mart sonu – Nisan 2009', 'Dipten dönüş mü, geçici tepki mi?',
   'Hisseler dipten toparlanmaya başladı ama birçok yatırımcı bunun geçici bir tepki olduğunu düşünüyor. Fed toplantısı ve Nisan başındaki G20 Londra zirvesi bekleniyor.',
   'Fed uzun vadeli devlet tahvili almaya başlayacağını açıkladı; G20, IMF kaynaklarını artırma sözü verdi. Muhasebe kurallarındaki esneklik banka hisselerini destekledi. Hisseler güçlü yükseldi; risk iştahı dönünce dolar/TL ve altın geriledi.',
   '{"hisse":11,"tahvil":-6.4,"altin":-12,"nakit":1.5,"usd":-8.1}'::jsonb),
  ('kuresel-finans-krizi-2008', 12, 'Mayıs 2009', 'Bankalar stres testinde',
   'ABD''de 19 büyük bankanın stres testi sonuçları açıklanmak üzere; hangi bankanın ne kadar ek sermaye bulması gerekeceği merak ediliyor.',
   'Stres testi toplamda yaklaşık 75 milyar dolarlık sermaye ihtiyacı gösterdi; bu beklentilerden azdı ve bankalar piyasadan sermaye topladı. Hisseler yükselişini sürdürdü, altın yeniden 1.000 dolara yaklaştı.',
   '{"hisse":6.3,"tahvil":-0.9,"altin":6.8,"nakit":0.9,"usd":-2.8}'::jsonb),
  ('kuresel-finans-krizi-2008', 13, 'Haziran – Temmuz 2009', 'Ekonomide toparlanma işaretleri',
   'Bazı öncü göstergeler ekonomideki daralmanın yavaşladığını gösteriyor. Hisseler Mart dibinden yaklaşık üçte bir yükseldi; yatırımcılar yükselişin sürüp sürmeyeceğini tartışıyor.',
   'Haziran''da yatay seyreden hisseler, Temmuz''da beklentileri aşan şirket kârlarıyla güçlü yükseldi. ABD resesyonunun Haziran 2009''da sona erdiği sonradan resmî olarak açıklanacaktı.',
   '{"hisse":4.1,"tahvil":-2.1,"altin":-6.5,"nakit":1.6,"usd":-4.2}'::jsonb),
  ('kuresel-finans-krizi-2008', 14, 'Ağustos – Eylül 2009', 'Yükseliş sürüyor',
   'ABD''de otomobil teşvik programı talebi canlandırdı; ancak işsizlik oranı yükselmeyi sürdürüyor. Faizlerin uzun süre düşük kalacağı beklentisi güçleniyor.',
   'Hisseler yükselişini sürdürdü; altın ons başına 1.000 doların üzerine yerleşti.',
   '{"hisse":7.9,"tahvil":2.5,"altin":4.7,"nakit":1.4,"usd":0}'::jsonb),
  ('kuresel-finans-krizi-2008', 15, 'Ekim – Kasım 2009', 'Altın rekor kovalıyor',
   'Zayıf dolar ve sıfıra yakın faizler altına ilgiyi artırıyor. Hisseler yükselişin ardından yatay bir bantta.',
   'Hindistan merkez bankası IMF''den 200 ton altın aldı; altın ons başına 1.150 doları aşarak rekor tazeledi. Kasım sonunda Dubai World''ün borç erteleme talebi kısa süreli bir satışa yol açtı.',
   '{"hisse":3.5,"tahvil":3.7,"altin":20,"nakit":1.3,"usd":1.7}'::jsonb),
  ('kuresel-finans-krizi-2008', 16, 'Aralık 2009', 'Avrupa’da yeni bir sorun: Yunanistan',
   'Yunanistan''ın kamu borcu ve bütçe açığına ilişkin kaygılar artıyor; derecelendirme kuruluşlarının kararları bekleniyor. Küresel ekonomi büyümeye geri dönüyor.',
   'Fitch ve S&P Yunanistan''ın notunu düşürdü. Altın kâr satışlarıyla rekorundan geriledi; hisseler yılı Mart dibinin çok üzerinde kapattı.',
   '{"hisse":1.4,"tahvil":-1.8,"altin":-7.5,"nakit":0.6,"usd":-0.3}'::jsonb),
  ('pandemi-soku-2020', 1, 'Şubat 2020, 3. hafta', 'Borsalar zirvede, virüs Çin dışına yayılıyor',
   'ABD hisseleri rekor seviyede. Çin''deki salgın fabrikaları ve tedarik zincirlerini aksatıyor; Güney Kore ve İran''da vaka sayıları artmaya başladı. Pek çok yorumcu ekonomik etkinin geçici olacağını düşünüyor.',
   'Hafta sonuna doğru endişe arttı ve hisseler zirveden hafifçe geriledi; altın güvenli liman talebiyle yedi yılın en yüksek seviyesine çıktı.',
   '{"hisse":-0.3,"tahvil":1.5,"altin":4.8,"nakit":0.2,"usd":1,"kripto":-5.6}'::jsonb),
  ('pandemi-soku-2020', 2, 'Şubat 2020, 4. hafta', 'İtalya’da salgın patlaması',
   'Hafta sonu İtalya''nın kuzeyinde vaka sayıları hızla arttı ve bazı kasabalar karantinaya alındı. Salgının Avrupa''ya yayılma hızı belirsiz.',
   'Küresel hisseler bir haftada %10''un üzerinde düştü; bu, tarihin en hızlı düzeltmelerinden biriydi. Nakit ihtiyacıyla altın bile satıldı; Bitcoin de değer kaybetti.',
   '{"hisse":-9.8,"tahvil":3.2,"altin":-1.5,"nakit":0.2,"usd":2.1,"kripto":-9.4}'::jsonb),
  ('pandemi-soku-2020', 3, 'Mart 2020, 1. hafta', 'Gözler merkez bankalarında',
   'Piyasalar merkez bankalarından destek bekliyor. Salgın ABD’de yayılmaya başladı; şirketler seyahatleri ve büyük etkinlikleri iptal ediyor.',
   'Fed, planlı toplantısını beklemeden faizi 0,5 puan indirdi. Hisseler sert dalgalanıp haftayı düşüşle kapattı; tahviller ve altın yükseldi.',
   '{"hisse":-4.5,"tahvil":-0.6,"altin":3.7,"nakit":0.2,"usd":-1.8,"kripto":4.2}'::jsonb),
  ('pandemi-soku-2020', 4, 'Mart 2020, 2. hafta', 'Petrolde fiyat savaşı',
   'Hafta sonu OPEC+ görüşmeleri anlaşmasız bitti ve Suudi Arabistan petrol fiyatlarını indirdi; pazartesi petrolde sert düşüş bekleniyor. Dünya Sağlık Örgütü''nün salgını pandemi olarak nitelendirmesi gündemde.',
   'Petrol 9 Mart''ta yaklaşık %25 düştü; ABD borsalarında hafta içinde iki kez işlemler durduruldu. 11 Mart''ta DSÖ pandemi ilan etti, Türkiye''de ilk vaka açıklandı. 12 Mart''ta Bitcoin bir günde yaklaşık %40 değer kaybetti; altın da nakit ihtiyacıyla düştü.',
   '{"hisse":-7.8,"tahvil":1.7,"altin":-5.6,"nakit":0.2,"usd":3.3,"kripto":-36.6}'::jsonb),
  ('pandemi-soku-2020', 5, 'Mart 2020, 3. hafta', 'Fed faizi sıfıra indirdi',
   'Pazar akşamı Fed faizi sıfıra yakın seviyeye indirdi ve büyük bir tahvil alım programı açıkladı. Birçok ülkede okullar ve sınırlar kapanıyor; şirketler nakit biriktirmek için ellerindeki varlıkları satıyor.',
   '16 Mart''ta ABD hisseleri bir günde yaklaşık %12 düştü. ''Nakde koşu'' sırasında tahviller ve altın da satıldı; dolar/TL yükseldi.',
   '{"hisse":-8.6,"tahvil":0,"altin":0.5,"nakit":0.2,"usd":2.5,"kripto":13.5}'::jsonb),
  ('pandemi-soku-2020', 6, 'Mart 2020, 4. hafta', '"Daha kötüsü gelecek" korkusu',
   'Küresel hisseler zirveden yaklaşık üçte bir değer kaybetti. ABD Kongresi''nde 2 trilyon dolarlık destek paketi görüşülüyor; birçok yatırımcı daha kötüsünün geleceğini düşünüyor.',
   'Fed 23 Mart''ta sınırsız varlık alımı açıkladı ve hisseler o gün dibi gördü. Destek paketi (CARES) yasalaştı; ABD hisseleri 1930''lardan bu yana en iyi haftalarından birini yaşadı.',
   '{"hisse":11.3,"tahvil":2.1,"altin":8.7,"nakit":0.2,"usd":0.3,"kripto":3.2}'::jsonb),
  ('pandemi-soku-2020', 7, 'Nisan 2020', 'Dünya evde',
   'Dünya nüfusunun büyük bölümü kapanma tedbirleri altında. ABD''de işsizlik başvuruları milyonlarla ölçülüyor ve petrol depoları dolmak üzere.',
   'ABD''de vadeli petrol fiyatı 20 Nisan''da tarihte ilk kez negatife düştü. Buna rağmen hisseler Nisan''da güçlü yükseldi. Dolar/TL 7''ye yaklaştı.',
   '{"hisse":20.5,"tahvil":9.7,"altin":11.6,"nakit":0.7,"usd":7.5,"kripto":45.8}'::jsonb),
  ('pandemi-soku-2020', 8, 'Mayıs 2020', 'Yeniden açılma planları',
   'Avrupa ve ABD’de kademeli yeniden açılma planları açıklanıyor; aşı çalışmalarından ilk veriler bekleniyor. TL üzerindeki baskı sürüyor.',
   'Bir aşı adayının erken verileri umut verdi ve hisseler yükselişini sürdürdü. Dolar/TL ay başında rekor kırdıktan sonra geriledi.',
   '{"hisse":1.6,"tahvil":-2.2,"altin":-0.2,"nakit":0.6,"usd":-2.7,"kripto":6.1}'::jsonb),
  ('pandemi-soku-2020', 9, 'Haziran 2020', 'Ekonomi yeniden açılıyor',
   'Kapanmaların gevşemesiyle ekonomik veriler toparlanıyor; ABD''de Mayıs istihdam verisinin kötü gelmesi bekleniyor. Bazı eyaletlerde vaka sayıları yeniden yükseliyor.',
   'ABD''de Mayıs''ta beklenmedik biçimde 2,5 milyon kişi işe döndü. Ay ortasında ikinci dalga korkusuyla sert bir düşüş yaşansa da hisseler ayı yükselişle kapattı.',
   '{"hisse":3.7,"tahvil":1.7,"altin":3.9,"nakit":0.6,"usd":0.9,"kripto":-2.2}'::jsonb),
  ('pandemi-soku-2020', 10, 'Temmuz 2020', 'Altına ilgi artıyor',
   'Faizlerin uzun süre sıfıra yakın kalacağı beklentisi altını destekliyor. AB liderleri büyük bir ortak kurtarma fonunu görüşüyor.',
   'AB liderleri 750 milyar euroluk kurtarma fonunda anlaştı. Altın 2011 rekorunu aştı; Bitcoin yeniden yükselişe geçti.',
   '{"hisse":6.7,"tahvil":3.4,"altin":12.7,"nakit":0.6,"usd":1.6,"kripto":25.9}'::jsonb),
  ('pandemi-soku-2020', 11, 'Ağustos 2020', 'Borsalar kayıplarını siliyor',
   'ABD hisseleri pandemi öncesi zirvesine çok yaklaştı. Türkiye''de dolar/TL 7''nin üzerinde; Merkez Bankası piyasaya verdiği likiditeyi kısıyor.',
   'Altın ons başına 2.000 doları ilk kez aştı. ABD hisseleri pandemi öncesi rekorunu geçti; TL değer kaybetmeyi sürdürdü.',
   '{"hisse":12.3,"tahvil":4.9,"altin":5.1,"nakit":0.7,"usd":5.5,"kripto":8.4}'::jsonb),
  ('pandemi-soku-2020', 12, 'Eylül – Ekim 2020', 'İkinci dalga ve seçim belirsizliği',
   'Avrupa''da vaka sayıları yeniden artıyor ve yeni kısıtlamalar gündemde. ABD başkanlık seçimi yaklaşıyor; teknoloji hisselerindeki hızlı yükselişin ardından değerlemeler tartışılıyor.',
   'Teknoloji hisselerindeki düzeltme ve ikinci dalga endişesiyle küresel hisseler dolar bazında geriledi. Merkez Bankası Eylül''de faizi %10,25''e çıkarsa da TL hızla değer kaybetti ve dolar/TL 8''i aştı; bu, dövizli varlıkların TL getirisini yukarı taşıdı.',
   '{"hisse":6.2,"tahvil":13,"altin":8.4,"nakit":1.6,"usd":13.6,"kripto":32.2}'::jsonb),
  ('pandemi-soku-2020', 13, 'Kasım 2020', 'Aşı haberi bekleniyor',
   'Türkiye''de Merkez Bankası başkanı değişti ve ekonomi yönetiminde yeni bir dönem başlıyor. ABD seçim sonuçları netleşiyor; ilaç şirketlerinin aşı çalışmalarından sonuç bekleniyor.',
   '9 Kasım''da bir aşının yüksek etkinlik gösterdiği açıklandı ve hisseler sert yükseldi. Merkez Bankası faizi %15''e çıkardı, TL değer kazandı. Bitcoin hızla yükseldi.',
   '{"hisse":6.5,"tahvil":-5.3,"altin":-11.3,"nakit":1.1,"usd":-6.2,"kripto":36.2}'::jsonb),
  ('pandemi-soku-2020', 14, 'Aralık 2020', 'Aşılama başlıyor',
   'Aşıların onay süreci hızlandı; ilk aşılamaların Aralık''ta başlaması bekleniyor. Bitcoin 2017 rekoruna yaklaştı.',
   'İngiltere ve ABD''de aşılama başladı. Bitcoin 20.000 doları aşıp yılı yaklaşık 29.000 dolarla kapattı; hisseler yılı rekor seviyede bitirdi. Merkez Bankası faizi %17''ye yükseltti.',
   '{"hisse":-1.8,"tahvil":-4,"altin":1.4,"nakit":1.3,"usd":-5.1,"kripto":39.6}'::jsonb),
  ('faiz-soku-2022', 1, 'Ocak 2022', 'Fed sıkılaşmaya hazırlanıyor',
   'ABD''de yıllık enflasyon yaklaşık %7 ile 40 yılın zirvesinde. Fed''in Mart''ta faiz artırmaya başlaması bekleniyor; yüksek değerlemeli teknoloji hisseleri baskı altında.',
   'Fed tutanakları daha hızlı sıkılaşma sinyali verdi; küresel hisseler yılın en kötü başlangıçlarından birini yaptı ve Bitcoin %15’ten fazla değer kaybetti. TL görece sakin seyretti.',
   '{"hisse":-4,"tahvil":-1,"altin":-0.7,"nakit":1.4,"usd":1.1,"kripto":-16}'::jsonb),
  ('faiz-soku-2022', 2, 'Şubat 2022', 'Ukrayna sınırında gerilim',
   'Rusya, Ukrayna sınırına on binlerce asker yığdı; diplomatik görüşmeler sürüyor. Enerji fiyatları yükseliyor.',
   'Rusya 24 Şubat''ta Ukrayna''ya saldırdı. Petrol ve altın yükseldi; hisseler dalgalı bir seyirle ayı hafif düşüşle kapattı.',
   '{"hisse":0.3,"tahvil":1.7,"altin":9.4,"nakit":1.4,"usd":3,"kripto":15.5}'::jsonb),
  ('faiz-soku-2022', 3, 'Mart 2022', 'Emtiada fiyat şoku',
   'Batı''nın Rusya''ya yaptırımları genişliyor; petrol ve doğal gaz fiyatları hızla yükseliyor. Fed''in Mart toplantısında 2018''den bu yana ilk faiz artışını yapması bekleniyor.',
   'Brent petrol ayın başında 130 doları aştı. Fed faizi 0,25 puan artırdı. Hisseler ay ortasından itibaren toparlandı; TL''deki değer kaybı dövizli varlıkların TL getirisini artırdı.',
   '{"hisse":8.8,"tahvil":2.9,"altin":7.5,"nakit":1.5,"usd":6,"kripto":11.8}'::jsonb),
  ('faiz-soku-2022', 4, 'Nisan 2022', 'Tahvil faizleri tırmanıyor',
   'ABD''de yıllık enflasyon %8''e yaklaştı; piyasalar Fed''den 0,5 puanlık artışlar fiyatlıyor ve uzun vadeli tahvil faizleri hızla yükseliyor.',
   'Mart enflasyonu %8,5 ile 40 yılın zirvesine çıktı. Teknoloji hisselerinde sert satış oldu; küresel hisseler ve tahviller birlikte değer kaybetti, kripto paralar da düştü.',
   '{"hisse":-7.7,"tahvil":-4.7,"altin":-1.3,"nakit":1.5,"usd":0.8,"kripto":-16.5}'::jsonb),
  ('faiz-soku-2022', 5, 'Mayıs 2022', 'Kriptoda çatlak',
   'Fed''in faizi 0,5 puan artırması ve bilanço küçültmeye başlaması bekleniyor. Kripto piyasasında dolara sabitlenmiş algoritmik stablecoin''lerin dayanıklılığı tartışılıyor.',
   'Fed faizi 0,5 puan artırdı. TerraUSD sabitini kaybetti ve bağlı LUNA tokenı birkaç gün içinde neredeyse değersizleşti; kripto piyasası sarsıldı. Dolar/TL 16’yı aştı.',
   '{"hisse":10.3,"tahvil":10.7,"altin":6.8,"nakit":1.5,"usd":10.3,"kripto":-7}'::jsonb),
  ('faiz-soku-2022', 6, 'Haziran 2022', 'Enflasyon zirve yaptı mı?',
   'Ekonomistler ABD enflasyonunun zirveyi gördüğünü umuyor; Fed''in en az 0,5 puan daha artırması bekleniyor. Bazı kripto kredi platformlarının sağlamlığı sorgulanıyor.',
   'Mayıs enflasyonu %8,6 ile beklentiyi aştı ve Fed faizi 1994''ten bu yana ilk kez 0,75 puan artırdı. ABD hisseleri ayı piyasasına girdi; Celsius çekimleri durdurdu ve Bitcoin 20.000 doların altına indi.',
   '{"hisse":-6.9,"tahvil":-1.1,"altin":0.5,"nakit":1.5,"usd":2.2,"kripto":-36.4}'::jsonb),
  ('faiz-soku-2022', 7, 'Temmuz 2022', 'Ayı piyasasında soluklanma?',
   'Hisseler zirveden %20''den fazla geriledi ve resesyon tartışmaları başladı. Fed''in bir 0,75 puanlık artış daha yapması bekleniyor.',
   'Fed beklendiği gibi 0,75 puan artırdı; artışların yavaşlayabileceği yorumlarıyla hisseler ve kripto güçlü bir ralli yaptı. Dolar/TL 18''e yaklaştı.',
   '{"hisse":15.7,"tahvil":9.6,"altin":4.9,"nakit":1.5,"usd":7.3,"kripto":26.4}'::jsonb),
  ('faiz-soku-2022', 8, 'Ağustos 2022', 'Jackson Hole öncesi',
   'Piyasalar Fed''in 2023''te faiz indirebileceğini fiyatlamaya başladı. Türkiye''de yıllık enflasyon %80''e yaklaştı; Merkez Bankası''nın adımları merak ediliyor.',
   'Merkez Bankası beklenmedik biçimde faizi %13''e indirdi. Fed Başkanı Powell, Jackson Hole konuşmasında enflasyonla mücadelenin süreceğini ve bunun ekonomiye maliyeti olacağını vurguladı; hisseler geriledi.',
   '{"hisse":-3.1,"tahvil":-2.6,"altin":-1.8,"nakit":1.5,"usd":1.3,"kripto":-12.8}'::jsonb),
  ('faiz-soku-2022', 9, 'Eylül 2022', 'Doların gücü',
   'Dolar endeksi 20 yılın zirvesinde. Fed''in üçüncü kez 0,75 puan artırması bekleniyor; İngiltere''de yeni hükümet büyük vergi indirimleri hazırlıyor.',
   'Fed yine 0,75 puan artırdı. İngiltere''de finansmanı belirsiz vergi indirimi planı tahvil piyasasında çalkantıya yol açtı ve İngiltere Merkez Bankası müdahale etti. Hisse, tahvil ve altın dolar bazında birlikte düştü.',
   '{"hisse":-7.8,"tahvil":-3.3,"altin":-1.1,"nakit":1.4,"usd":1.9,"kripto":-1.3}'::jsonb),
  ('faiz-soku-2022', 10, 'Ekim 2022', 'Kayıplar yılın dibinde',
   'Küresel hisseler yılbaşından bu yana yaklaşık %25 aşağıda; tahviller de tarihî kayıplar yaşıyor. İngiltere''de hükümet ağır baskı altında.',
   'Hisseler ay ortasında yılın dibini gördükten sonra güçlü toparlandı. İngiltere''de başbakan göreve gelişinden yaklaşık altı hafta sonra istifa etti. Merkez Bankası faizi %10,5''e indirdi.',
   '{"hisse":7.7,"tahvil":-0.2,"altin":-1.2,"nakit":1.4,"usd":0.5,"kripto":6.1}'::jsonb),
  ('faiz-soku-2022', 11, 'Kasım 2022', 'Kripto borsasında alarm',
   'Büyük kripto borsası FTX''in mali durumu hakkında soru işaretleri var. ABD''de Ekim enflasyon verisi açıklanmak üzere.',
   'FTX birkaç gün içinde iflas başvurusunda bulundu ve kripto piyasası yeniden çöktü. Enflasyon beklentinin altında gelince hisseler ve tahviller sert yükseldi.',
   '{"hisse":7.2,"tahvil":4.9,"altin":8.4,"nakit":1.4,"usd":0.2,"kripto":-16.1}'::jsonb),
  ('faiz-soku-2022', 12, 'Aralık 2022', 'Yıl kapanıyor',
   'Fed''in faiz artış hızını düşürmesi bekleniyor. 2022, hisse ve tahvillerin birlikte düştüğü nadir yıllardan biri olarak kayıtlara geçmek üzere.',
   'Fed faizi 0,5 puan artırdı ve yüksek faizin bir süre korunacağı mesajını verdi; hisseler yılı düşüşle kapattı. TL''nin değer kaybı TL bazlı getirileri yukarı taşısa da yıllık enflasyon %64''ü aştı.',
   '{"hisse":-4.8,"tahvil":0.9,"altin":3.6,"nakit":1.4,"usd":0.4,"kripto":-3.2}'::jsonb),
  ('tl-kur-soku-2018', 1, 'Ocak – Şubat 2018', 'Borsa rekorda, piyasalar sakin',
   'Borsa İstanbul rekor seviyeye yakın. ABD’de tahvil faizleri yükseliyor; küresel piyasalarda uzun süredir görülmeyen bir sakinlik var. Dolar/TL 3,8 civarında.',
   'Şubat başında küresel hisselerde oynaklığın ani yükselişiyle sert ama kısa süreli bir düşüş yaşandı. Borsa İstanbul dönemi hafif yükselişle kapattı; kur yatay kaldı.',
   '{"hisse":3.1,"tahvil":1.5,"altin":1.4,"nakit":2.1,"usd":0.3}'::jsonb),
  ('tl-kur-soku-2018', 2, 'Mart 2018', 'Gözler not kararlarında',
   'Kredi derecelendirme kuruluşlarının Türkiye notunu yeniden değerlendirmesi bekleniyor. Yatırımcılar cari açığı ve yüksek enflasyonu yakından izliyor.',
   'Moody''s Türkiye''nin notunu bir kademe indirdi. TL değer kaybetti ve dolar/TL 3,95''i aştı; borsa geriledi.',
   '{"hisse":-3.4,"tahvil":-1,"altin":4.8,"nakit":1.1,"usd":4.2}'::jsonb),
  ('tl-kur-soku-2018', 3, 'Nisan 2018', 'Siyasi takvim değişebilir',
   'Kurdaki değer kaybı hızlanıyor; Merkez Bankası’nın faiz artırıp artırmayacağı tartışılıyor. Siyasi takvimde değişiklik olabileceği konuşuluyor.',
   '18 Nisan''da 24 Haziran için erken seçim kararı açıklandı. Merkez Bankası geç likidite penceresi faizini 0,75 puan artırdı; dolar/TL 4''ü aştı ve borsa sert düştü.',
   '{"hisse":-9.2,"tahvil":-2,"altin":1.8,"nakit":1.1,"usd":2.5}'::jsonb),
  ('tl-kur-soku-2018', 4, 'Mayıs 2018', 'Kurda sert yükseliş',
   'Bir derecelendirme kuruluşu daha Türkiye''nin notunu indirdi ve dolar/TL hızla yükseliyor. Piyasalar Merkez Bankası''ndan güçlü bir faiz adımı bekliyor.',
   'Dolar/TL 23 Mayıs''ta 4,90''a dayandı; Merkez Bankası olağanüstü toplantıyla faizi %16,5''e çıkardı ve ardından para politikasını sadeleştirdi. Kur ay sonunda bir miktar geriledi; altın TL bazında yükseldi.',
   '{"hisse":-3.5,"tahvil":-4,"altin":10.1,"nakit":1.3,"usd":11.6}'::jsonb),
  ('tl-kur-soku-2018', 5, 'Haziran 2018', 'Seçim haftaları',
   'Seçime üç hafta kala belirsizlik sürüyor; Merkez Bankası''nın yeni bir faiz artışı yapıp yapmayacağı tartışılıyor. Nisan''da yıllık enflasyon yaklaşık %11''di ve yükseliyor.',
   'Merkez Bankası faizi %17,75''e yükseltti. 24 Haziran seçimlerinin ardından kur yatay seyretti; borsa geriledi.',
   '{"hisse":-4.1,"tahvil":0.5,"altin":-2.7,"nakit":1.4,"usd":0.9}'::jsonb),
  ('tl-kur-soku-2018', 6, 'Temmuz 2018', 'Yeni yönetim sistemi',
   'Cumhurbaşkanlığı hükümet sistemine geçildi ve yeni kabine açıklanacak. Enflasyon hızla yükseliyor; piyasalar Merkez Bankası’nın Temmuz toplantısında faiz artırmasını bekliyor.',
   'Haziran''da yıllık enflasyon %15''i aştı. Merkez Bankası 24 Temmuz''da beklentilerin aksine faizi sabit bıraktı ve TL değer kaybetti; Rahip Brunson davası ABD ile ilişkileri gerdi.',
   '{"hisse":-1,"tahvil":-1.5,"altin":3.8,"nakit":1.4,"usd":6.3}'::jsonb),
  ('tl-kur-soku-2018', 7, 'Ağustos 2018, 1. hafta', 'ABD ile gerilim tırmanıyor',
   'Rahip Brunson''un ev hapsine alınmasının ardından ABD ile ilişkiler gergin; Washington''un yaptırım uygulayabileceği konuşuluyor.',
   'ABD Hazinesi 1 Ağustos''ta iki bakana yaptırım uyguladı. Dolar/TL 5''i aştı; borsa ve TL tahviller geriledi.',
   '{"hisse":-1.8,"tahvil":-2,"altin":3.8,"nakit":0.4,"usd":4.5}'::jsonb),
  ('tl-kur-soku-2018', 8, 'Ağustos 2018, 2. hafta', 'Görüşmelerden sonuç çıkmadı',
   'Ankara’dan bir heyet Washington’da görüşmeler yaptı ama somut sonuç çıkmadı. Kurdaki yükseliş hızlanıyor; yatırımcılar Merkez Bankası’ndan adım bekliyor.',
   '10 Ağustos''ta ABD''nin Türkiye''den çelik ve alüminyum ithalatındaki gümrük vergisini iki katına çıkaracağını açıklamasıyla TL tek günde yaklaşık %14 değer kaybetti; dolar/TL haftayı 6,4''ün üzerinde kapattı. TL tahviller sert düştü.',
   '{"hisse":-4.5,"tahvil":-6.5,"altin":26.4,"nakit":0.4,"usd":26.6}'::jsonb),
  ('tl-kur-soku-2018', 9, 'Ağustos 2018, 3. hafta', 'Pazartesi panik mi?',
   'Hafta sonu gelen açıklamalar endişeyi azaltmadı; pazartesi Asya seansında kurun 7''nin üzerine çıkabileceği konuşuluyor. Bankacılık otoritelerinin önlem hazırladığı biliniyor.',
   '13 Ağustos''ta dolar/TL gün içinde 7''nin üzerine çıktı. BDDK ve Merkez Bankası''nın likidite ve swap önlemleri ile Katar''ın 15 milyar dolarlık yatırım taahhüdüyle kur hafta sonunda 6''ya geriledi.',
   '{"hisse":0.2,"tahvil":2,"altin":-8.5,"nakit":0.4,"usd":-6.4}'::jsonb),
  ('tl-kur-soku-2018', 10, 'Ağustos 2018, son iki hafta', 'Bayram sessizliği',
   'Kurban Bayramı tatili nedeniyle piyasalar birkaç gün kapalı. Kur geçici olarak sakinleşti ama yapısal sorunlar sürüyor; Eylül’deki Merkez Bankası toplantısı kritik görülüyor.',
   'Bayram sonrasında TL yeniden değer kaybetti ve dolar/TL ay sonunda 6,5''i aştı. Arjantin pesosundaki çöküş gelişmekte olan ülke piyasalarını da baskıladı.',
   '{"hisse":3.2,"tahvil":-4,"altin":10.4,"nakit":0.8,"usd":8.8}'::jsonb),
  ('tl-kur-soku-2018', 11, 'Eylül 2018, 1–2. hafta', 'Gözler Merkez Bankası’nda',
   'Ağustos''ta yıllık enflasyon %17,9''a çıktı. Piyasalar 13 Eylül''deki toplantıda büyük bir faiz artışı bekliyor; aksi halde kurun yeniden yükselebileceği konuşuluyor.',
   'Merkez Bankası politika faizini 6,25 puan artırarak %24''e çıkardı. TL güçlü değer kazandı; borsa ve TL tahviller toparlandı.',
   '{"hisse":1.9,"tahvil":3.5,"altin":-5.3,"nakit":0.9,"usd":-4.7}'::jsonb),
  ('tl-kur-soku-2018', 12, 'Eylül sonu – Ekim 2018', 'Yeni Ekonomi Programı',
   'Hükümet orta vadeli Yeni Ekonomi Programı’nı açıklamaya hazırlanıyor. Brunson davasında yeni duruşma Ekim ortasında. ABD tahvil faizlerinin yükselmesi küresel piyasalarda endişe yaratıyor.',
   'Yeni Ekonomi Programı açıklandı. Brunson''un 12 Ekim''de serbest bırakılmasıyla ABD ile ilişkiler yumuşadı ve dolar/TL 5,6''ya geriledi. Küresel hisselerdeki Ekim satışı borsayı da aşağı çekti.',
   '{"hisse":-4.6,"tahvil":7,"altin":-9,"nakit":3,"usd":-10.6}'::jsonb),
  ('tl-kur-soku-2018', 13, 'Kasım 2018', 'Enflasyon zirvede mi?',
   'Ekim''de yıllık enflasyon %25''i aştı. Mevduat faizleri %24''ün üzerinde; petrol fiyatları sert düşüyor.',
   'Petrol fiyatlarındaki düşüş ve sıkı para politikası TL’yi destekledi; dolar/TL 5,2’ye indi. Borsa ve TL tahviller yükseldi.',
   '{"hisse":5.8,"tahvil":6.5,"altin":-6.3,"nakit":1.9,"usd":-6.8}'::jsonb),
  ('tl-kur-soku-2018', 14, 'Aralık 2018', 'Küresel satış dalgası',
   'ABD-Çin ticaret gerilimi ve Fed''in faiz artırımları küresel hisseleri baskılıyor. Merkez Bankası faizi %24''te sabit tutuyor.',
   'ABD hisseleri 1931''den bu yana en kötü Aralık ayını yaşadı; Borsa İstanbul da geriledi. Altın güvenli liman talebiyle yükseldi.',
   '{"hisse":-4.3,"tahvil":2.5,"altin":6.7,"nakit":1.8,"usd":1.7}'::jsonb),
  ('tl-kur-soku-2018', 15, 'Ocak – Şubat 2019', 'Fed sabırlı olacak mı?',
   'Fed''in 2019''da faiz artırımlarına ara verebileceği sinyalleri geliyor. Türkiye''de enflasyon gerilemeye başladı ama ekonomi daralma sinyalleri veriyor.',
   'Fed''in sabırlı olacağını açıklamasıyla gelişmekte olan piyasalara para girişi oldu; Borsa İstanbul güçlü yükseldi, TL tahviller kazandırdı. Kur yatay seyretti.',
   '{"hisse":12.9,"tahvil":5,"altin":3.2,"nakit":3.4,"usd":0.8}'::jsonb)
  ) AS v(slug, turn_no, period_label, headline, narrative, outcome, returns)
  JOIN crisis_scenarios s ON s.slug = v.slug
 WHERE NOT EXISTS (SELECT 1 FROM crisis_turns t WHERE t.scenario_id = s.id)
ON CONFLICT (scenario_id, turn_no) DO NOTHING;
