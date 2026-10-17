# PortfoyGo tanıtım sunumu — tek dosyalık HTML üretir (görseller gömülü).
# Kullanım: python build_deck.py <shots_klasörü> <çıktı.html>
import base64, io, sys
from pathlib import Path
from PIL import Image

SHOTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])

def img(name, max_w=1800, q=82):
    im = Image.open(SHOTS / f"{name}.png").convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

P = "M13 13.2A2.2 2.2 0 0 1 15.2 11H25.5A9.5 9.5 0 0 1 25.5 30H20.5V34.8A2.2 2.2 0 0 1 18.3 37H15.2A2.2 2.2 0 0 1 13 34.8Z"
ARROW = "M20.4 24.6 28.4 16.6M22.2 16.2H28.8V22.8"
_uid = [0]

def mark(size, inverse=False):
    _uid[0] += 1
    u = _uid[0]
    bg = "#FFFFFF" if inverse else f"url(#g{u})"
    glyph = "#465FFF" if inverse else "#FFFFFF"
    return (f'<svg class="mark" width="{size}" height="{size}" viewBox="0 0 48 48" aria-hidden="true"><defs>'
            f'<linearGradient id="g{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#465FFF"/><stop offset="1" stop-color="#3641F5"/></linearGradient>'
            f'<mask id="m{u}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><path fill="#fff" d="{P}"/>'
            f'<path d="{ARROW}" fill="none" stroke="#000" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>'
            f'<rect width="48" height="48" rx="12" fill="{bg}"/><rect width="48" height="48" fill="{glyph}" mask="url(#m{u})"/></svg>')

def wordmark(size=40, dark=False):
    return f'<span class="wm{" wm-dark" if dark else ""}" style="font-size:{size}px">Portfoy<b>Go</b></span>'

def shot(name, cls="shot"):
    return f'<div class="{cls}"><div class="bar"><i></i><i></i><i></i></div><img src="{img(name)}" alt=""></div>'

def bullets(items):
    return "<ul class='bl'>" + "".join(f"<li>{t}</li>" for t in items) + "</ul>"

slides = []
def add(html, theme="light", sec=None):
    slides.append((html, theme, sec))

# ---------------------------------------------------------------- 1 Kapak
add(f"""
<div class="cover">
  <div class="cover-logo">{mark(132)}{wordmark(112, dark=True)}</div>
  <h1 class="cover-tag">Gerçek piyasa. <span class="hl">Sanal para.</span> Gerçek rekabet.</h1>
  <p class="cover-sub">Sanal yatırım simülasyonu · yatırım eğitimi · rekabet platformu</p>
  <p class="cover-date">Tanıtım · Ekim 2026</p>
</div>""", "dark")

# ---------------------------------------------------------------- 2 Problem
add("""
<p class="eyebrow">Problem</p>
<h2 class="statement">Yatırımı öğrenmenin bugünkü yolu:<br><span class="hl">gerçek parayı kaybederek.</span></h2>
<div class="cards3">
  <div class="card"><h3>İlgi çok yüksek</h3><p>Borsa, kripto, döviz ve altına ilgi hiç olmadığı kadar fazla.</p></div>
  <div class="card"><h3>Deneyim pahalı</h3><p>İlk adımlar genellikle gerçek parayla, rehbersiz ve yalnız atılıyor.</p></div>
  <div class="card"><h3>Güvenli ortam yok</h3><p>Risksiz, eğlenceli ve ölçülebilir bir öğrenme ve yarışma alanı eksik.</p></div>
</div>""")

# ---------------------------------------------------------------- 3 Çözüm
add(f"""
<p class="eyebrow">Çözüm</p>
<h2 class="title">{wordmark(72)}: gerçek veriyle, sıfır riskle yatırım</h2>
<div class="cards3 tall">
  <div class="card c-blue"><div class="ic">📈</div><h3>Simülasyon</h3><p>Gerçek piyasa verisi, 100.000 TL sanal bakiye. Hisse, kripto, döviz ve emtia alıp sat.</p></div>
  <div class="card c-orange"><div class="ic">🎮</div><h3>Oyun ve rekabet</h3><p>Hızlı turlar, düellolar, ligler, haftalık yarışmalar ve sezonlar.</p></div>
  <div class="card c-green"><div class="ic">🎓</div><h3>Eğitim ve portföy</h3><p>Risk profili, portföy önerisi, senaryo analizi ve her turdan sonra koç geri bildirimi.</p></div>
</div>""")

# ---------------------------------------------------------------- 4 İki hedef
add("""
<p class="eyebrow">Ürün stratejisi</p>
<h2 class="title">İki hedef, tek platform</h2>
<div class="two">
  <div class="panel p-orange"><p class="num">01</p><h3>Oyuncu odaklı hızlı al-sat</h3>
    <ul class="bl"><li>Az sayıda enstrüman, tek dokunuşla işlem</li><li>Kısa süreli turlar, düellolar ve canlı meydan okumalar</li><li>Ligler, sezonlar, haftalık yarışmalar</li></ul></div>
  <div class="panel p-blue"><p class="num">02</p><h3>Yatırımcı eğitimi ve portföy</h3>
    <ul class="bl"><li>Risk profili anketi → önerilen dağılım</li><li>Modern portföy teorisi ve Monte Carlo</li><li>Model portföy, senaryo ve stres testleri</li></ul></div>
</div>""")

def section(n, title, sub):
    add(f"""<div class="sect"><p class="sect-n">{n}</p><h2>{title}</h2><p>{sub}</p></div>""", "brand", title)

def feature(eyebrow, title, items, shot_name, flip=False):
    left = f'<div class="ftext"><p class="eyebrow">{eyebrow}</p><h2 class="title sm">{title}</h2>{bullets(items)}</div>'
    right = shot(shot_name)
    inner = right + left if flip else left + right
    add(f'<div class="feature{" flip" if flip else ""}">{inner}</div>')

# ---------------------------------------------------------------- Temel deneyim
section("1", "Temel deneyim", "Piyasa → işlem → portföy")
feature("Panel", "Her şey tek ekranda", [
    "Herkes <b>100.000 TL sanal bakiye</b> ile başlar",
    "Portföy performans grafiği ve varlık dağılımı",
    "İzleme listesi, trend varlıklar, son işlemler",
    "Açık ve koyu tema, mobil uyumlu",
], "panel")
feature("Piyasalar", "Hisse, kripto, döviz ve emtia", [
    "ABD hisseleri, kripto paralar, döviz ve emtia",
    "<b>TL ve USD</b> fiyatlar, 7 günlük mini grafikler",
    "Gerçek varlık logoları ve bayraklar",
    "Fiyatı her zaman <b>sunucu belirler</b> — hile yapılamaz",
], "markets", flip=True)
feature("Varlık sayfası", "Detaylı grafik ve performans", [
    "Aralık seçimli fiyat grafiği (1G → Tümü)",
    "Performans kutucukları: 1H, 1A, 3A, 6A, YB, 1Y",
    "ABD borsası saatleri: <b>Piyasa açık / kapalı</b> rozeti",
    "Tek tıkla al-sat ve izleme listesi",
], "asset")

add("""
<p class="eyebrow">İşlem</p>
<h2 class="title">Gerçek borsa gibi emir tipleri</h2>
<div class="orders">
  <table>
    <tr><th>Emir</th><th>Ne yapar?</th></tr>
    <tr><td>Piyasa</td><td>Anında güncel fiyattan alır / satar</td></tr>
    <tr><td>Limit</td><td>Belirlenen fiyata gelince işler; alışta nakit bloke edilir</td></tr>
    <tr><td>Zarar durdur</td><td>Fiyat düşerse pozisyonu otomatik kapatır</td></tr>
    <tr><td>Kâr al</td><td>Hedef fiyatta kârı otomatik realize eder</td></tr>
    <tr><td>Takip eden stop</td><td>Zirveyi takip eder, % veya TL mesafeyle korur</td></tr>
    <tr><td>Açılışta gerçekleştir</td><td>Borsa kapalıyken sıraya alınır, açılışta işlenir</td></tr>
  </table>
  <div class="facts">
    <div class="fact"><p class="big">%0,25</p><p>işlem komisyonu — maliyet farkındalığı</p></div>
    <div class="fact"><p class="big">%25 · %50 · %100</p><p>tek tıkla kısmi kapatma</p></div>
    <div class="fact"><p class="big">Alış ≠ Satış</p><p>dövizde gerçekçi kur makası</p></div>
  </div>
</div>""")
feature("Portföy", "Pozisyonlar, kâr / zarar ve dağılım", [
    "Ortalama maliyet ve anlık kâr / zarar",
    "Varlık sınıfı dağılımı ve performans geçmişi",
    "Bekleyen emirler: limit, stop, takip eden stop",
    "Tüm işlem geçmişi",
], "portfolio", flip=True)

# ---------------------------------------------------------------- Eğitim ve portföy
section("2", "Eğitim ve portföy", "Doğru risk, doğru dağılım")
feature("Portföy Sihirbazı", "Risk profiline göre portföy önerisi", [
    "8 soruluk risk anketi → 5 risk profili",
    "<b>Modern portföy teorisi</b> ile kısıtlı optimizasyon",
    "<b>Monte Carlo</b>: beklenen getiri aralığı, zarar olasılığı, en kötü düşüş",
    "Tek tıkla sanal portföye uygula · yatırım tavsiyesi değildir",
], "advisor")
add(f"""
<p class="eyebrow">100.000 USD Model Portföy</p>
<h2 class="title sm">Dağıt, sına, karşılaştır</h2>
<div class="pair">
  <div>{shot("model", "shot small")}<p class="cap">Dağılım, nakdin yeri, her varlığın toplam getiriye katkısı ve <b>“Ya … olursa?”</b> simülatörü</p></div>
  <div>{shot("model-compare", "shot small")}<p class="cap">Alternatif dağılımların karşılaştırılması: getiri, oynaklık, en büyük düşüş, çeşitlendirme</p></div>
</div>""")
feature("Global Portföy Lab", "Küresel varlık sınıflarını araştır", [
    "48 küresel araç: bölge, varlık sınıfı, para birimi, risk seviyesi",
    "Alternatifleri sınıflandır ve yan yana karşılaştır",
    "Senaryo ve <b>stres testi</b>: 2008, 2020, 2022, TL şoku",
    "<b>Premium</b> modül — abonelik altyapısı hazır",
], "globallab", flip=True)

# ---------------------------------------------------------------- Oyun Merkezi
section("3", "Oyun Merkezi", "Mobil oyun hissi, gerçek piyasa mantığı")
add(f"""
<div class="feature">
  <div class="ftext"><p class="eyebrow">Oyun Merkezi</p><h2 class="title sm">Oyna, yarış, öğren</h2>
  {bullets(["EUR/USD, altın, petrol ve Bitcoin ile 1–10 dakikalık turlar",
            "Fiyatlar gerçek bir geçmiş dönemin <b>hızlandırılmış tekrarı</b>",
            "Jeton, XP, seviye, kademeler (Bronz → Elmas)",
            "Masaüstünde tam ekran lobi, telefonda mobil oyun"])}</div>
  {shot("oyun")}
</div>""")
add("""
<p class="eyebrow">Oyun modları</p>
<h2 class="title">Her oyuncu için bir mod</h2>
<div class="modes">
  <div class="mode m1"><h3>⚡ Hızlı Maç & Düello</h3><p>1’e 1 eşleşme, davet linki, rövanş, halat çekme çubuğu</p></div>
  <div class="mode m2"><h3>🎯 Solo Tur + Koç Kemal</h3><p>Tur sonu A–E karne: risk, disiplin, kalite, sonuç</p></div>
  <div class="mode m3"><h3>🏆 Meydan Okumalar</h3><p>Sponsorlu canlı etkinlikler, OBS yayın ekranı</p></div>
  <div class="mode m4"><h3>📜 Senaryolar</h3><p>Tarihi anları yeniden oyna: brifing → tur → “Ne oldu?”</p></div>
  <div class="mode m5"><h3>🏙️ Yatırım İmparatorluğu</h3><p>Gelirleri gerçek piyasa hareketine bağlı idle oyun</p></div>
  <div class="mode m6"><h3>🎡 Çark · Görevler · Mağaza</h3><p>Ücretsiz günlük çark, günlük görevler, kozmetikler</p></div>
  <div class="mode m7"><h3>✉️ Haftalık Seçim</h3><p>Kitlelerin bilgeliği: gizli seçim, sonra paylaşım</p></div>
  <div class="mode m8"><h3>🎰 Slot Makinesi</h3><p>Olasılık dersi: kasa her zaman kazanır, oranlar açık</p></div>
</div>""")
add(f"""
<p class="eyebrow">Haftalık Seçim — Kitlelerin Bilgeliği</p>
<h2 class="title sm">Önce bağımsız karar, sonra paylaşım</h2>
<div class="tl">
  <div class="step"><p class="when">Cumartesi 00:00</p><h3>Gizli seçim</h3><p>Herkes tek başına bir varlık ve yön seçer</p></div>
  <div class="step"><p class="when">Pazar 15:00</p><h3>Açılış</h3><p>Tüm seçimler açılır, kitlenin seçimi görünür</p></div>
  <div class="step"><p class="when">Pazartesi → Cuma</p><h3>Yarış</h3><p>Canlı sıralama ve tartışma</p></div>
  <div class="step"><p class="when">Cumartesi</p><h3>Sonuç</h3><p>Kitle portföyü katılımcılarla kıyaslanır, ödüller</p></div>
</div>
<p class="src">Dr. Alexander Elder’ın anlattığı SpikeTrade yarışmasından uyarlandı. Seçimler açılana kadar sunucuda gizlidir.</p>""")
add(f"""
<p class="eyebrow">Oyunla öğrenmek</p>
<h2 class="title sm">Eğlenceli ama dürüst</h2>
<div class="pair">
  <div>{shot("idle", "shot small")}<p class="cap"><b>Yatırım İmparatorluğu:</b> binaların geliri bugünkü gerçek piyasa hareketiyle değişir; bileşik getiri ve çeşitlendirme ipuçları</p></div>
  <div>{shot("slot", "shot small")}<p class="cap"><b>Slot Makinesi:</b> geri ödeme %95, kasa payı %5 — olasılıklar her zaman görünür, beklenen değer canlı çizilir</p></div>
</div>""")
add("""
<div class="resp">
  <p class="eyebrow light">Sorumlu oyun</p>
  <h2 class="statement light">Para yatırılamaz, çekilemez.<br>Jetonlar yalnızca oyun içidir.</h2>
  <div class="chips">
    <span>18+ onayı</span><span>Kişisel günlük limit</span><span>Oturum hatırlatıcısı</span><span>Kısaltılamayan mola</span>
    <span>Art arda zarar uyarısı</span><span>Olasılıklar her zaman açık</span><span>Hile yok, otomatik çevirme yok</span><span>Yönetimden tek tıkla kapatma</span>
  </div>
</div>""", "accent")

# ---------------------------------------------------------------- Rekabet ve topluluk
section("4", "Rekabet ve topluluk", "Adil yarış, ortak akıl")
feature("Ligler ve Portföy Ligi", "Arkadaşlar, okullar, şirketler için", [
    "Özel ve herkese açık ligler, davet kodu, aylık sezonlar",
    "<b>Portföy Ligi:</b> aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyeti",
    "Bireysel veya <b>takım</b> portföyleri",
    "Sonunda stratejiler ve sonuçlar yan yana: “Al-tut”, “Yoğun işlem”…",
], "leagues")
feature("Ortak Akıl Öneri Havuzu", "Fikirden gerekçeli, izlenen öneriye", [
    "Varlık, gerekçe, beklenen senaryo, riskler, izleme kriterleri",
    "Yayından beri performans otomatik takip edilir",
    "“Katılıyorum / Katılmıyorum” — gerekçesiyle",
    "Kapanışta zorunlu değerlendirme · tavsiye değildir",
], "idea", flip=True)
feature("Profil ve bildirimler", "Paylaşılabilir oyuncu profili", [
    "Herkese açık profil: yalnızca yüzde ve sıralar, tutar yok",
    "Unvanlar, rozetler, Arena kademesi, Haftalık Seçim geçmişi",
    "Canlı bildirim merkezi ve haftalık özet e-postası",
    "Profil gizlenebilir",
], "profile")

# ---------------------------------------------------------------- Platform
section("5", "Platform", "Yönetim, mimari, güvenlik ve kalite")
feature("Yönetim paneli", "Operasyon tek yerde", [
    "Kullanıcılar, işlemler, emirler, ligler, meydan okumalar",
    "Moderasyon: yorumlar, öneriler, notlar",
    "Sistem durumu: zamanlanmış işler, veri tazeliği",
    "Tüm yönetici işlemleri denetim kaydında · 2FA zorunlu",
], "admin", flip=True)
add("""
<p class="eyebrow">Mimari</p>
<h2 class="title">Ölçeklenebilir, modüler yapı</h2>
<div class="arch">
  <div class="row">
    <div class="box b-blue"><h3>Site</h3><p>Next.js · React</p></div>
    <div class="box b-blue"><h3>Yönetim paneli</h3><p>Next.js · React</p></div>
  </div>
  <div class="arrow">↓ httpOnly çerez oturumu · CSRF koruması</div>
  <div class="row">
    <div class="box b-dark wide"><h3>API</h3><p>Node.js · Express · zod doğrulama · fiyatı sunucu belirler</p></div>
    <div class="box b-dark"><h3>Worker</h3><p>Zamanlanmış işler · iş kilitleri</p></div>
  </div>
  <div class="arrow">↓</div>
  <div class="row">
    <div class="box b-light"><h3>PostgreSQL</h3><p>Sıralı migration'lar · yedekli</p></div>
    <div class="box b-light"><h3>Redis</h3><p>Çok sunucu · canlı akış</p></div>
    <div class="box b-light wide"><h3>Veri sağlayıcı katmanı</h3><p>Hisse · kripto · döviz · emtia · haber — değiştirilebilir adaptörler</p></div>
  </div>
</div>""")
add("""
<p class="eyebrow">Güvenlik ve KVKK</p>
<h2 class="title">Güven, ürünün temeli</h2>
<div class="grid4">
  <div class="card"><h3>Adil oyun</h3><p>Fiyat ve tur sonucu sunucuda; işlemler satır kilitli tek transaction</p></div>
  <div class="card"><h3>Oturum</h3><p>httpOnly çerez, CSRF koruması, tüm cihazlardan çıkış</p></div>
  <div class="card"><h3>İki adımlı doğrulama</h3><p>TOTP + kurtarma kodları; yöneticilere zorunlu</p></div>
  <div class="card"><h3>İçerik güvenliği</h3><p>Nonce tabanlı CSP ve güvenlik başlıkları</p></div>
  <div class="card"><h3>KVKK</h3><p>Verilerimi indir, hesabımı sil (anonimleştirme), yalnızca zorunlu çerezler</p></div>
  <div class="card"><h3>Denetim</h3><p>Tüm yönetici işlemleri kayıt altında</p></div>
  <div class="card"><h3>Hız sınırları</h3><p>Giriş, kayıt, e-posta ve API uçlarında</p></div>
  <div class="card"><h3>Gözlemlenebilirlik</h3><p>Hata takibi, metrikler, sağlık uçları</p></div>
</div>""")
add("""
<p class="eyebrow">Kalite ve ölçek</p>
<h2 class="title">Test edilmiş, yük altında denenmiş</h2>
<div class="stats">
  <div class="stat"><p class="big">700+</p><p>sunucu testi</p></div>
  <div class="stat"><p class="big">370+</p><p>arayüz testi</p></div>
  <div class="stat"><p class="big">19</p><p>uçtan uca tarayıcı testi</p></div>
  <div class="stat"><p class="big">~1.400</p><p>istek / saniye<br><span class="muted">1.000 kullanıcılık veri<br>p99&nbsp;141&nbsp;ms</span></p></div>
</div>
<p class="src">Her kod gönderiminde otomatik test (GitHub Actions). Birden çok sunucuya yatay ölçeklenebilir.</p>""")

# ---------------------------------------------------------------- İş modeli ve yol haritası
add("""
<p class="eyebrow">İş modeli</p>
<h2 class="title">Gelir kalemleri</h2>
<div class="grid4 biz">
  <div class="card c-orange"><h3>Sponsorlu yarışmalar</h3><p>Aracı kurum ve fintech sponsorlu, ödüllü meydan okumalar</p></div>
  <div class="card c-blue"><h3>Premium</h3><p>Global Portföy Lab senaryoları ve gelişmiş analizler</p></div>
  <div class="card c-green"><h3>Kurumsal ve eğitim</h3><p>Okullar, kulüpler ve şirketler için özel ligler ve paneller</p></div>
  <div class="card c-purple"><h3>Veri ve analiz</h3><p>Anonim, toplu içgörüler ve raporlar</p></div>
</div>
<p class="src">Kapsam dışı: gerçek para yatırma ve gerçek yatırım yönlendirmesi (SPK düzenlemeleri).</p>""")
add("""
<p class="eyebrow">Yol haritası</p>
<h2 class="title">Sırada ne var?</h2>
<div class="tl road">
  <div class="step now"><p class="when">Şimdi</p><h3>MVP testi</h3><p>~1.000 kişilik test grubu · demo lig · gecikmeli veri</p></div>
  <div class="step"><p class="when">Sıradaki</p><h3>Yayına hazırlık</h3><p>Lisanslı veri sağlayıcı · staging · hukuk onayları</p></div>
  <div class="step"><p class="when">Sonra</p><h3>Kapsam</h3><p>BIST hisseleri · gerçek zamanlı fiyat akışı · fon / ETF</p></div>
  <div class="step"><p class="when">Büyüme</p><h3>Yaygınlaşma</h3><p>Kurumsal paket · mobil uygulama · takip etme · İngilizce</p></div>
</div>""")
add("""
<p class="eyebrow">Ekip</p>
<h2 class="title">Kim ne yapıyor?</h2>
<div class="grid4 team">
  <div class="card"><div class="av">Y</div><h3>Yasin</h3><p>Geliştirme, ürün ve canlı veri gereksinimleri</p></div>
  <div class="card"><div class="av">A</div><h3>Art</h3><p>Oyun akışı, lig ve etkinlik formatı</p></div>
  <div class="card"><div class="av">K</div><h3>Koray</h3><p>Veri sağlayıcıları ve maliyet</p></div>
  <div class="card"><div class="av">H</div><h3>H. Burak</h3><p>Portföy, risk anketi ve senaryolar</p></div>
</div>""")

# ---------------------------------------------------------------- Kapanış
add(f"""
<div class="cover end">
  <div class="cover-logo">{mark(110)}{wordmark(92, dark=True)}</div>
  <h1 class="cover-tag">Teşekkürler</h1>
  <p class="cover-sub">Gerçek piyasa. Sanal para. Gerçek rekabet.</p>
  <p class="cover-date">Sorular?</p>
</div>""", "dark")

# ------------------------------------------------------------------ HTML
N = len(slides)
def footer(i, theme):
    if i == 0 or i == N - 1 or theme in ("brand",):
        return ""
    dark = theme in ("dark", "accent")
    return f'<div class="foot{" foot-dark" if dark else ""}">{mark(30)}<span>PortfoyGo</span><span class="pg">{i + 1} / {N}</span></div>'

sections_html = "\n".join(
    f'<section class="slide t-{theme}" aria-roledescription="slide" aria-label="{i + 1} / {N}" data-i="{i}"><div class="inner">{html}</div>{footer(i, theme)}</section>'
    for i, (html, theme, sec) in enumerate(slides)
)

CSS = r"""
:root{--brand:#465FFF;--brand2:#3641F5;--brand-l:#7592FF;--ink:#101828;--ink2:#344054;--muted:#667085;--line:#E4E7EC;--bg:#F7F8FC;--card:#FFFFFF;--navy:#0B1120;--navy2:#111a33;--green:#12B76A;--orange:#F79009;--purple:#7A5AF8;--pink:#EE46BC}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#05070d;overflow:hidden;font-family:Outfit,"Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center}
.slide{position:absolute;inset:0;background:var(--bg);color:var(--ink);opacity:0;visibility:hidden;transition:opacity .45s ease,transform .45s ease;transform:translateY(14px);overflow:hidden}
.slide.on{opacity:1;visibility:visible;transform:none}
.inner{position:absolute;inset:0;padding:110px 128px 140px;display:flex;flex-direction:column;justify-content:center}
.t-dark{background:radial-gradient(1200px 700px at 85% 10%,rgba(70,95,255,.35),transparent 60%),radial-gradient(900px 600px at 0% 100%,rgba(117,146,255,.18),transparent 60%),var(--navy);color:#F2F4F7}
.t-brand{background:linear-gradient(135deg,#465FFF 0%,#3641F5 100%);color:#fff}
.t-accent{background:radial-gradient(1000px 600px at 100% 0%,rgba(247,144,9,.25),transparent 60%),var(--navy2);color:#F2F4F7}
.eyebrow{font-size:26px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--brand);margin-bottom:18px}
.eyebrow.light{color:#FDB022}
.title{font-size:72px;font-weight:700;line-height:1.08;letter-spacing:-.025em;margin-bottom:56px}
.title.sm{font-size:60px;margin-bottom:40px}
.statement{font-size:84px;font-weight:700;line-height:1.08;letter-spacing:-.03em;margin-bottom:70px}
.statement.light{color:#fff}
.hl{color:var(--brand)}
.t-dark .hl{color:var(--brand-l)}
.wm{font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.wm b{color:var(--brand);font-weight:700}
.wm-dark{color:#fff}.wm-dark b{color:var(--brand-l)}
.cover{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;height:100%}
.cover-logo{display:flex;align-items:center;gap:36px;margin-bottom:70px}
.cover-tag{font-size:92px;font-weight:700;line-height:1.05;letter-spacing:-.03em;max-width:1500px}
.cover-sub{font-size:38px;color:#C1C9DC;margin-top:30px}
.cover-date{font-size:28px;color:#8C97B2;margin-top:90px;letter-spacing:.06em}
.end .cover-tag{font-size:120px}
.cards3{display:grid;grid-template-columns:repeat(3,1fr);gap:36px}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:40px 40px 44px;box-shadow:0 12px 32px rgba(16,24,40,.06)}
.card h3{font-size:38px;font-weight:700;margin-bottom:14px;letter-spacing:-.01em}
.card p{font-size:28px;line-height:1.45;color:var(--muted)}
.cards3.tall .card{padding:48px}
.ic{font-size:64px;margin-bottom:22px}
.c-blue{border-top:8px solid var(--brand)}.c-orange{border-top:8px solid var(--orange)}.c-green{border-top:8px solid var(--green)}.c-purple{border-top:8px solid var(--purple)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:44px}
.panel{border-radius:28px;padding:52px 56px;color:#fff}
.p-orange{background:linear-gradient(140deg,#F79009,#DC6803)}.p-blue{background:linear-gradient(140deg,#465FFF,#3641F5)}
.panel .num{font-size:30px;font-weight:700;opacity:.75;margin-bottom:14px}
.panel h3{font-size:46px;font-weight:700;margin-bottom:26px;line-height:1.15}
.panel .bl li{color:#fff}.panel .bl li::before{background:#fff}
.bl{list-style:none;display:flex;flex-direction:column;gap:20px}
.bl li{font-size:32px;line-height:1.4;color:var(--ink2);padding-left:38px;position:relative}
.bl li::before{content:"";position:absolute;left:0;top:16px;width:14px;height:14px;border-radius:4px;background:var(--brand)}
.bl b{color:var(--ink);font-weight:700}
.sect{display:flex;flex-direction:column;justify-content:center;height:100%}
.sect-n{font-size:200px;font-weight:800;line-height:1;opacity:.25;margin-bottom:10px}
.sect h2{font-size:120px;font-weight:700;letter-spacing:-.03em;line-height:1.02}
.sect p{font-size:44px;margin-top:26px;opacity:.85}
.feature{display:grid;grid-template-columns:640px 1fr;gap:70px;align-items:center;height:100%}
.feature.flip{grid-template-columns:1fr 640px}
.ftext .bl li{font-size:30px}
.shot{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px rgba(16,24,40,.18),0 0 0 1px rgba(16,24,40,.06)}
.t-dark .shot{box-shadow:0 30px 80px rgba(0,0,0,.5)}
.shot .bar{height:34px;background:#EEF1F6;display:flex;align-items:center;gap:9px;padding:0 16px}
.shot .bar i{width:12px;height:12px;border-radius:50%;background:#D0D5DD;display:block}
.shot .bar i:first-child{background:#F97066}.shot .bar i:nth-child(2){background:#FDB022}.shot .bar i:nth-child(3){background:#32D583}
.shot img{display:block;width:100%;height:auto}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:48px}
.cap{font-size:27px;line-height:1.45;color:var(--muted);margin-top:26px}
.cap b{color:var(--ink)}
.orders{display:grid;grid-template-columns:1.35fr 1fr;gap:56px;align-items:start}
table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden}
th,td{text-align:left;padding:20px 28px;font-size:28px;border-bottom:1px solid var(--line)}
th{background:#F2F4F7;color:var(--muted);font-weight:600;font-size:24px;text-transform:uppercase;letter-spacing:.08em}
tr:last-child td{border-bottom:none}
td:first-child{font-weight:700;color:var(--ink);white-space:nowrap}
td{color:var(--ink2)}
.facts{display:flex;flex-direction:column;gap:26px}
.fact{background:#fff;border:1px solid var(--line);border-radius:22px;padding:30px 36px;border-left:8px solid var(--brand)}
.fact .big{font-size:52px;font-weight:800;color:var(--brand);letter-spacing:-.02em}
.fact p{font-size:27px;color:var(--muted)}
.modes{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.mode{border-radius:24px;padding:34px 32px;color:#fff;min-height:250px;box-shadow:0 10px 0 rgba(0,0,0,.12)}
.mode h3{font-size:31px;font-weight:700;margin-bottom:14px;line-height:1.2}
.mode p{font-size:25px;line-height:1.4;opacity:.95}
.m1{background:linear-gradient(160deg,#22C55E,#16A34A)}.m2{background:linear-gradient(160deg,#465FFF,#3641F5)}
.m3{background:linear-gradient(160deg,#FB923C,#EA580C)}.m4{background:linear-gradient(160deg,#14B8A6,#0D9488)}
.m5{background:linear-gradient(160deg,#FACC15,#CA8A04)}.m6{background:linear-gradient(160deg,#F472B6,#DB2777)}
.m7{background:linear-gradient(160deg,#0EA5E9,#0369A1)}.m8{background:linear-gradient(160deg,#A855F7,#7E22CE)}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative;margin-top:20px}
.tl::before{content:"";position:absolute;left:40px;right:40px;top:42px;height:6px;background:linear-gradient(90deg,var(--brand),var(--brand-l));border-radius:3px}
.step{position:relative;padding:90px 30px 0 0}
.step::before{content:"";position:absolute;left:0;top:26px;width:38px;height:38px;border-radius:50%;background:#fff;border:8px solid var(--brand)}
.step.now::before{background:var(--brand)}
.when{font-size:24px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand);margin-bottom:12px}
.step h3{font-size:40px;font-weight:700;margin-bottom:12px}
.step p{font-size:27px;line-height:1.45;color:var(--muted)}
.src{font-size:24px;color:var(--muted);margin-top:56px}
.resp{display:flex;flex-direction:column;justify-content:center;height:100%}
.chips{display:flex;flex-wrap:wrap;gap:18px;max-width:1600px}
.chips span{font-size:30px;font-weight:600;padding:16px 30px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff}
.arch{display:flex;flex-direction:column;gap:18px}
.arch .row{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:28px}
.box{border-radius:22px;padding:28px 34px}
.box.wide{grid-column:span 2}
.box h3{font-size:36px;font-weight:700;margin-bottom:6px}
.box p{font-size:25px;line-height:1.4}
.b-blue{background:var(--brand);color:#fff}.b-blue p{color:#DCE3FF}
.b-dark{background:var(--navy);color:#fff}.b-dark p{color:#AEB8D0}
.b-light{background:#fff;border:1px solid var(--line)}.b-light p{color:var(--muted)}
.arrow{font-size:26px;color:var(--muted);text-align:center;font-weight:600}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.grid4 .card{padding:32px 32px 36px}
.grid4 .card h3{font-size:32px}.grid4 .card p{font-size:25px}
.biz .card{padding:40px 36px 44px}.biz .card h3{font-size:36px}.biz .card p{font-size:27px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:32px}
.stat{background:#fff;border:1px solid var(--line);border-radius:26px;padding:46px 40px}
.stat .big{font-size:96px;font-weight:800;color:var(--brand);letter-spacing:-.03em;line-height:1}
.stat p{font-size:30px;color:var(--ink2);margin-top:16px;line-height:1.35}
.muted{color:var(--muted);font-size:24px}
.team .card{text-align:left}
.av{width:96px;height:96px;border-radius:50%;background:linear-gradient(140deg,#465FFF,#7592FF);color:#fff;font-size:44px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.foot{position:absolute;left:128px;right:128px;bottom:48px;display:flex;align-items:center;gap:14px;font-size:24px;font-weight:700;color:var(--muted)}
.foot .pg{margin-left:auto;font-weight:600}
.foot-dark{color:#8C97B2}
#ui{position:fixed;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.08);z-index:5}
#bar{height:100%;width:0;background:linear-gradient(90deg,#465FFF,#7592FF);transition:width .35s ease}
#hint{position:fixed;right:18px;bottom:14px;font:500 13px/1 system-ui,sans-serif;color:rgba(255,255,255,.55);z-index:5;transition:opacity .6s}
@media print{
  @page{size:1920px 1080px;margin:0}
  html,body{overflow:visible;background:#fff}
  #stage{position:static;transform:none!important;width:1920px;height:auto}
  .slide{position:relative;opacity:1;visibility:visible;transform:none;width:1920px;height:1080px;page-break-after:always;break-after:page}
  #ui,#hint{display:none}
}
@media (prefers-reduced-motion:reduce){.slide{transition:none}}
"""

JS = r"""
(function(){
  var stage=document.getElementById('stage'),slides=[].slice.call(document.querySelectorAll('.slide')),bar=document.getElementById('bar'),hint=document.getElementById('hint');
  var i=0,n=slides.length;
  function fit(){var s=Math.min(window.innerWidth/1920,window.innerHeight/1080);stage.style.transform='translate(-50%,-50%) scale('+s+')';}
  function go(k){k=Math.max(0,Math.min(n-1,k));if(slides[i])slides[i].classList.remove('on');i=k;slides[i].classList.add('on');bar.style.width=((i+1)/n*100)+'%';if(location.hash!=='#'+(i+1))history.replaceState(null,'','#'+(i+1));}
  function full(){var d=document;if(!d.fullscreenElement){(d.documentElement.requestFullscreen||function(){}).call(d.documentElement);}else{d.exitFullscreen();}}
  document.addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowRight'||k==='PageDown'||k===' '||k==='Enter'||k==='ArrowDown'){e.preventDefault();go(i+1);}
    else if(k==='ArrowLeft'||k==='PageUp'||k==='Backspace'||k==='ArrowUp'){e.preventDefault();go(i-1);}
    else if(k==='Home'){go(0);}else if(k==='End'){go(n-1);}
    else if(k==='f'||k==='F'){full();}
  });
  document.addEventListener('click',function(e){if(e.clientX>window.innerWidth*0.35)go(i+1);else go(i-1);});
  var x0=null;document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
  document.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)go(i+(dx<0?1:-1));x0=null;});
  window.addEventListener('resize',fit);
  window.addEventListener('hashchange',function(){var h=parseInt(location.hash.slice(1),10);if(h&&h-1!==i)go(h-1);});
  fit();var h=parseInt(location.hash.slice(1),10);go(h?h-1:0);
  setTimeout(function(){hint.style.opacity=0;},4500);
})();
"""

html = f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PortfoyGo — Tanıtım Sunumu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
<div id="stage">
{sections_html}
</div>
<div id="ui"><div id="bar"></div></div>
<div id="hint">← → ile geç · F: tam ekran</div>
<script>{JS}</script>
</body>
</html>
"""
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"{N} slayt → {OUT} ({OUT.stat().st_size/1024/1024:.1f} MB)")
