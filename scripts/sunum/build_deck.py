# PortfoyGo — kullanıcı tanıtım sunumu (tek dosyalık HTML, görseller ve grafikler gömülü).
# Kullanım: python build_deck.py <shots_klasörü> <çıktı.html>
# Grafikler gerçek hesaplamadır (çeşitlendirme formülü, Monte Carlo, bileşik getiri, beklenen değer);
# varsayımlar slaytlardaki notlarda yazılıdır.
import base64, io, math, sys
from pathlib import Path
import numpy as np
from PIL import Image

SHOTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
DATE = "Ekim 2026"

# ---------------------------------------------------------------- yardımcılar
def img(name, max_w=1800, q=84):
    im = Image.open(SHOTS / f"{name}.png").convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

def tr(x, d=0):
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")

P = "M13 13.2A2.2 2.2 0 0 1 15.2 11H25.5A9.5 9.5 0 0 1 25.5 30H20.5V34.8A2.2 2.2 0 0 1 18.3 37H15.2A2.2 2.2 0 0 1 13 34.8Z"
ARROW = "M20.4 24.6 28.4 16.6M22.2 16.2H28.8V22.8"
_uid = [0]

def mark(size):
    _uid[0] += 1
    u = _uid[0]
    return (f'<svg class="mark" width="{size}" height="{size}" viewBox="0 0 48 48" aria-hidden="true"><defs>'
            f'<linearGradient id="lg{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#465FFF"/><stop offset="1" stop-color="#3641F5"/></linearGradient>'
            f'<mask id="lm{u}" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><path fill="#fff" d="{P}"/>'
            f'<path d="{ARROW}" fill="none" stroke="#000" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>'
            f'<rect width="48" height="48" rx="12" fill="url(#lg{u})"/><rect width="48" height="48" fill="#fff" mask="url(#lm{u})"/></svg>')

def wordmark(size, light=False):
    return f'<span class="wm{" wm-l" if light else ""}" style="font-size:{size}px">Portfoy<b>Go</b></span>'

def shot(name, cls="shot"):
    return f'<figure class="{cls}"><img src="{img(name)}" alt=""></figure>'

def bullets(items):
    return '<ul class="bl">' + "".join(f"<li>{t}</li>" for t in items) + "</ul>"

def head(eyebrow, title, sub=None):
    s = f'<header class="hd"><p class="eyebrow"><i></i>{eyebrow}</p><h2 class="title">{title}</h2>'
    if sub:
        s += f'<p class="dek">{sub}</p>'
    return s + "</header>"

def note(text):
    return f'<p class="note">{text}</p>'

# ---------------------------------------------------------------- grafikler (SVG)
INK, MUTED, RULE, BRAND, ORANGE, GREEN, RED = "#111827", "#5B6474", "#DAD6CC", "#465FFF", "#E8890C", "#0E9F6E", "#D92D20"

def axis_svg(w, h, pad, xs, ys, xlab, ylab, xfmt, yfmt):
    l, r, t, b = pad
    x0, x1 = xs; y0, y1 = ys
    X = lambda v: l + (v - x0) / (x1 - x0) * (w - l - r)
    Y = lambda v: h - b - (v - y0) / (y1 - y0) * (h - t - b)
    return X, Y

def diversification_chart():
    w, h = 980, 560
    pad = (96, 40, 30, 80)
    sigma, rho = 30.0, 0.3
    ns = np.arange(1, 31)
    sp = np.sqrt(sigma**2 / ns + (1 - 1 / ns) * rho * sigma**2)
    floor = math.sqrt(rho) * sigma
    X, Y = axis_svg(w, h, pad, (1, 30), (0, 32), "", "", None, None)
    g = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="Varlık sayısı arttıkça portföy oynaklığı azalır">']
    for v in range(0, 33, 8):
        g.append(f'<line x1="{X(1)}" y1="{Y(v)}" x2="{X(30)}" y2="{Y(v)}" stroke="{RULE}" stroke-width="1.5"/>')
        g.append(f'<text x="{X(1)-16}" y="{Y(v)+9}" text-anchor="end" class="tk">%{v}</text>')
    for v in (1, 5, 10, 15, 20, 25, 30):
        g.append(f'<text x="{X(v)}" y="{h-pad[3]+44}" text-anchor="middle" class="tk">{v}</text>')
    g.append(f'<line x1="{X(1)}" y1="{Y(floor)}" x2="{X(30)}" y2="{Y(floor)}" stroke="{ORANGE}" stroke-width="3" stroke-dasharray="10 8"/>')
    g.append(f'<text x="{X(30)}" y="{Y(floor)+40}" text-anchor="end" class="lbl" fill="{ORANGE}">Çeşitlendirilemeyen (piyasa) riski ≈ %{tr(floor,1)}</text>')
    pts = " ".join(f"{X(n):.1f},{Y(s):.1f}" for n, s in zip(ns, sp))
    area = f"{X(1):.1f},{Y(floor):.1f} " + pts + f" {X(30):.1f},{Y(floor):.1f}"
    g.append(f'<polygon points="{area}" fill="{BRAND}" fill-opacity=".10"/>')
    g.append(f'<polyline points="{pts}" fill="none" stroke="{BRAND}" stroke-width="5" stroke-linejoin="round"/>')
    for n in (1, 5, 10):
        s = float(sp[n - 1])
        g.append(f'<circle cx="{X(n)}" cy="{Y(s)}" r="9" fill="#fff" stroke="{BRAND}" stroke-width="4"/>')
        g.append(f'<text x="{X(n)+16}" y="{Y(s)-14}" class="val">%{tr(s,1)}</text>')
    g.append(f'<text x="{(X(1)+X(30))/2}" y="{h-8}" text-anchor="middle" class="ax">Portföydeki varlık sayısı</text>')
    g.append(f'<text transform="translate(22 {(Y(0)+Y(32))/2}) rotate(-90)" text-anchor="middle" class="ax">Portföy oynaklığı (yıllık)</text>')
    g.append("</svg>")
    return "".join(g), sp

def fan_chart():
    rng = np.random.default_rng(20261017)
    mu, sig, years, steps, n = 0.08, 0.15, 10, 12, 2000
    dt = 1 / steps
    shocks = rng.standard_normal((n, years * steps))
    logret = (mu - 0.5 * sig**2) * dt + sig * math.sqrt(dt) * shocks
    paths = 100_000 * np.exp(np.cumsum(logret, axis=1))
    paths = np.hstack([np.full((n, 1), 100_000.0), paths])
    t = np.arange(0, years * steps + 1) / steps
    pct = {p: np.percentile(paths, p, axis=0) for p in (5, 25, 50, 75, 95)}
    w, h = 980, 560
    pad = (130, 40, 30, 80)
    ymax = 500_000
    X, Y = axis_svg(w, h, pad, (0, 10), (0, ymax), "", "", None, None)
    g = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="10 yıllık örnek Monte Carlo simülasyonu">']
    for v in range(0, ymax + 1, 100_000):
        g.append(f'<line x1="{X(0)}" y1="{Y(v)}" x2="{X(10)}" y2="{Y(v)}" stroke="{RULE}" stroke-width="1.5"/>')
        g.append(f'<text x="{X(0)-16}" y="{Y(v)+9}" text-anchor="end" class="tk">{tr(v/1000)} bin</text>')
    for yv in range(0, 11, 2):
        g.append(f'<text x="{X(yv)}" y="{h-pad[3]+44}" text-anchor="middle" class="tk">{yv}. yıl</text>')
    idx = range(0, len(t), 3)
    def band(lo, hi, op):
        up = " ".join(f"{X(t[i]):.1f},{Y(min(hi[i], ymax)):.1f}" for i in idx)
        dn = " ".join(f"{X(t[i]):.1f},{Y(min(lo[i], ymax)):.1f}" for i in reversed(list(idx)))
        return f'<polygon points="{up} {dn}" fill="{BRAND}" fill-opacity="{op}"/>'
    g.append(band(pct[5], pct[95], ".12"))
    g.append(band(pct[25], pct[75], ".22"))
    med = " ".join(f"{X(t[i]):.1f},{Y(pct[50][i]):.1f}" for i in idx)
    g.append(f'<polyline points="{med}" fill="none" stroke="{BRAND}" stroke-width="5"/>')
    g.append(f'<line x1="{X(0)}" y1="{Y(100_000)}" x2="{X(10)}" y2="{Y(100_000)}" stroke="{MUTED}" stroke-width="2" stroke-dasharray="6 8"/>')
    end = {p: float(pct[p][-1]) for p in pct}
    g.append(f'<text x="{X(10)-10}" y="{Y(min(end[95], ymax))-14}" text-anchor="end" class="lbl" fill="{BRAND}">%95: {tr(end[95]/1000)} bin</text>')
    g.append(f'<text x="{X(10)-10}" y="{Y(end[50])-18}" text-anchor="end" class="val">Medyan: {tr(end[50]/1000)} bin TL</text>')
    g.append(f'<text x="{X(10)-10}" y="{Y(end[5])+40}" text-anchor="end" class="lbl" fill="{MUTED}">%5: {tr(end[5]/1000)} bin</text>')
    g.append(f'<text x="{(X(0)+X(10))/2}" y="{h-8}" text-anchor="middle" class="ax">Yıl</text>')
    g.append("</svg>")
    loss_prob = float((paths[:, -1] < 100_000).mean() * 100)
    return "".join(g), end, loss_prob

def compounding_chart():
    r, n0, periods = 0.10, 100.0, 20
    comp = [n0 * (1 + r) ** k for k in range(periods + 1)]
    simp = [n0 * (1 + r * k) for k in range(periods + 1)]
    w, h = 900, 500
    pad = (90, 40, 30, 76)
    X, Y = axis_svg(w, h, pad, (0, periods), (0, 700), "", "", None, None)
    g = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="Bileşik ve basit getiri karşılaştırması">']
    for v in range(0, 701, 200):
        g.append(f'<line x1="{X(0)}" y1="{Y(v)}" x2="{X(periods)}" y2="{Y(v)}" stroke="{RULE}" stroke-width="1.5"/>')
        g.append(f'<text x="{X(0)-14}" y="{Y(v)+9}" text-anchor="end" class="tk">{v}</text>')
    for k in range(0, periods + 1, 5):
        g.append(f'<text x="{X(k)}" y="{h-pad[3]+42}" text-anchor="middle" class="tk">{k}</text>')
    pc = " ".join(f"{X(k):.1f},{Y(v):.1f}" for k, v in enumerate(comp))
    ps = " ".join(f"{X(k):.1f},{Y(v):.1f}" for k, v in enumerate(simp))
    g.append(f'<polyline points="{ps}" fill="none" stroke="{MUTED}" stroke-width="4" stroke-dasharray="10 8"/>')
    g.append(f'<polyline points="{pc}" fill="none" stroke="{GREEN}" stroke-width="5"/>')
    g.append(f'<text x="{X(periods-1)}" y="{Y(comp[-1])+6}" text-anchor="end" class="val" fill="{GREEN}">Bileşik: {tr(comp[-1])}</text>')
    g.append(f'<text x="{X(periods)-8}" y="{Y(simp[-1])+42}" text-anchor="end" class="lbl" fill="{MUTED}">Basit: {tr(simp[-1])}</text>')
    g.append(f'<text x="{(X(0)+X(periods))/2}" y="{h-6}" text-anchor="middle" class="ax">Dönem</text>')
    g.append("</svg>")
    return "".join(g), comp[-1], simp[-1]

def ev_chart():
    w, h = 900, 500
    g = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="100 jetonluk bahiste beklenen dağılım">']
    bx, bw, by, bh = 110, 680, 150, 120
    g.append(f'<rect x="{bx}" y="{by}" width="{bw*0.95}" height="{bh}" rx="10" fill="{BRAND}"/>')
    g.append(f'<rect x="{bx+bw*0.95+6}" y="{by}" width="{bw*0.05-6}" height="{bh}" rx="6" fill="{RED}"/>')
    g.append(f'<text x="{bx+28}" y="{by+76}" class="bigv" fill="#fff">95 jeton geri döner</text>')
    g.append(f'<text x="{bx+bw+18}" y="{by+56}" class="val" fill="{RED}">5</text>')
    g.append(f'<text x="{bx+bw+18}" y="{by+92}" class="lbl" fill="{RED}">kasa</text>')
    g.append(f'<text x="{bx}" y="{by-34}" class="ax">Her 100 jetonluk bahiste, uzun vadede ortalama</text>')
    g.append(f'<text x="{bx}" y="{by+bh+90}" class="lbl" fill="{INK}">Beklenen değer = Σ (olasılık × ödeme) = 0,95 × bahis</text>')
    g.append(f'<text x="{bx}" y="{by+bh+140}" class="lbl" fill="{MUTED}">Kısa vadede şans büyük görünür;</text>')
    g.append(f'<text x="{bx}" y="{by+bh+176}" class="lbl" fill="{MUTED}">çok çevirmede sonuç beklenen değere yaklaşır.</text>')
    g.append("</svg>")
    return "".join(g)

def risk_return_chart():
    w, h = 980, 560
    pad = (96, 40, 30, 80)
    pts = [("Nakit / mevduat", 0.08, 0.14, MUTED), ("Tahvil", 0.22, 0.27, MUTED), ("Altın", 0.42, 0.40, ORANGE),
           ("Hisse senedi", 0.62, 0.60, BRAND), ("Kripto para", 0.90, 0.80, RED)]
    X = lambda v: pad[0] + v * (w - pad[0] - pad[1])
    Y = lambda v: h - pad[3] - v * (h - pad[2] - pad[3])
    g = [f'<svg viewBox="0 0 {w} {h}" class="chart" role="img" aria-label="Kavramsal risk ve getiri ilişkisi">']
    g.append(f'<line x1="{X(0)}" y1="{Y(0)}" x2="{X(1)}" y2="{Y(0)}" stroke="{INK}" stroke-width="2.5"/>')
    g.append(f'<line x1="{X(0)}" y1="{Y(0)}" x2="{X(0)}" y2="{Y(1)}" stroke="{INK}" stroke-width="2.5"/>')
    g.append(f'<path d="M{X(0.04)} {Y(0.08)} Q {X(0.45)} {Y(0.32)} {X(0.95)} {Y(0.86)}" fill="none" stroke="{RULE}" stroke-width="22" stroke-linecap="round"/>')
    for name, x, y, c in pts:
        g.append(f'<circle cx="{X(x)}" cy="{Y(y)}" r="14" fill="{c}"/>')
        anchor = "end" if x > 0.8 else "start"
        dx = -26 if x > 0.8 else 26
        g.append(f'<text x="{X(x)+dx}" y="{Y(y)+10}" text-anchor="{anchor}" class="lbl" fill="{INK}">{name}</text>')
    g.append(f'<text x="{X(1)}" y="{h-30}" text-anchor="end" class="ax">Risk (oynaklık) →</text>')
    g.append(f'<text transform="translate(40 {Y(1)}) rotate(-90)" text-anchor="end" class="ax">Beklenen getiri →</text>')
    g.append("</svg>")
    return "".join(g)

DIV_SVG, DIV_SP = diversification_chart()
FAN_SVG, FAN_END, FAN_LOSS = fan_chart()
COMP_SVG, COMP_END, SIMP_END = compounding_chart()
EV_SVG = ev_chart()
RR_SVG = risk_return_chart()
ROUND_TRIP = 0.0025 * 2
YEAR_COST = (1 - (1 - ROUND_TRIP) ** 48) * 100

# ---------------------------------------------------------------- slaytlar
slides = []
def add(html, theme="paper"):
    slides.append((html, theme))

def section(n, title, sub):
    add(f'<div class="sect"><p class="sect-n">{n}</p><h2>{title}</h2><p>{sub}</p></div>', "navy")

def feature(eyebrow, title, items, shot_name, flip=False, foot=None):
    text = f'<div class="ftext">{head(eyebrow, title)}{bullets(items)}</div>'
    pic = shot(shot_name)
    body = (pic + text) if flip else (text + pic)
    add(f'<div class="feature{" flip" if flip else ""}">{body}</div>' + (note(foot) if foot else ""))

# 1 — Kapak
add(f"""
<div class="cover">
  <div class="cover-logo">{mark(104)}{wordmark(88, light=True)}</div>
  <h1>Gerçek piyasa verisiyle,<br><em>risksiz</em> yatırım deneyimi</h1>
  <p class="cover-sub">Yatırım kararlarınızı sanal parayla sınayın, ölçün ve geliştirin.</p>
  <p class="cover-meta">Kullanıcı tanıtımı · {DATE}</p>
</div>""", "navy")

# 2 — Neden
add(head("Neden PortfoyGo?", "Yatırımda öğrenmenin bedeli çoğu zaman gerçek paradır") + """
<div class="cols3">
  <div class="col"><p class="kicker">01</p><h3>Risk ve getiri ayrılmaz</h3><p>Daha yüksek beklenen getiri, daha yüksek oynaklığı kabul etmeyi gerektirir. Bu dengeyi yaşayarak öğrenmek en kalıcı yoldur.</p></div>
  <div class="col"><p class="kicker">02</p><h3>Deneyim pahalıdır</h3><p>İlk kararlar genellikle gerçek parayla, ölçmeden ve geri bildirim almadan verilir; hataların maliyeti yüksektir.</p></div>
  <div class="col"><p class="kicker">03</p><h3>Simülasyon maliyetsizdir</h3><p>Aynı kararları gerçek piyasa verisiyle ama sanal parayla vermek; sonucu ölçmek ve tekrar denemek mümkündür.</p></div>
</div>""")

# 3 — Nedir
add(head("PortfoyGo nedir?", "Simülasyon, eğitim ve rekabet tek platformda") + """
<div class="cols3 cards">
  <div class="card"><h3>Simülasyon</h3><p>Gerçek piyasa verisi ile <b>100.000 TL sanal bakiye</b>. ABD hisseleri, kripto paralar, döviz ve emtia.</p></div>
  <div class="card"><h3>Eğitim</h3><p>Risk profili, portföy önerisi, senaryo analizi ve her işlem turundan sonra kişisel geri bildirim.</p></div>
  <div class="card"><h3>Rekabet</h3><p>Kısa süreli turlar, düellolar ve haftalık yarışmalarla kararlarınızı başkalarınınkiyle kıyaslayın.</p></div>
</div>""" + note("PortfoyGo bir eğitim ve simülasyon platformudur; gerçek para yatırılmaz ve yatırım tavsiyesi verilmez."))

# 4 — Nasıl çalışır
add(head("Nasıl çalışır?", "Dört adımda başlayın") + """
<div class="steps">
  <div class="st"><p class="sn">1</p><h3>Hesap açın</h3><p>Ücretsiz kayıt; e-posta doğrulaması.</p></div>
  <div class="st"><p class="sn">2</p><h3>Sanal bakiye</h3><p>100.000 TL ile portföyünüzü kurun.</p></div>
  <div class="st"><p class="sn">3</p><h3>Karar verin</h3><p>Piyasaları inceleyin, işlem yapın, emir girin.</p></div>
  <div class="st"><p class="sn">4</p><h3>Ölçün ve öğrenin</h3><p>Getiri, risk ve maliyeti izleyin; stratejinizi geliştirin.</p></div>
</div>""")

# § 1
section("1", "Piyasalar ve işlem", "Gerçek veri, gerçekçi kurallar")
feature("Panel", "Portföyünüz tek bakışta", [
    "Toplam varlık, nakit ve günlük değişim",
    "Portföy performans grafiği: 1H, 1A, 3A, 1Y, Tümü",
    "Varlık sınıfı dağılımı ve izleme listesi",
    "Masaüstü ve mobilde, açık ve koyu temada",
], "panel")
feature("Piyasalar", "Dört varlık sınıfı, TL ve USD", [
    "ABD hisseleri, kripto paralar, döviz ve emtia",
    "Fiyatları <b>TL veya USD</b> olarak görüntüleme",
    "7 günlük mini grafikler, arama ve izleme listesi",
    "Fiyatlar sunucu tarafında belirlenir; herkes için aynıdır",
], "markets", flip=True)
feature("Varlık sayfası", "Karar vermeden önce inceleyin", [
    "Aralık seçimli fiyat grafiği",
    "Haftalık, aylık, yıllık performans",
    "ABD borsası seans saatleri: piyasa açık / kapalı",
    "Tek tıkla alım, satım ve izleme listesi",
], "asset")

add(head("İşlem", "Emir tipleri ve maliyetin etkisi") + f"""
<div class="orders">
  <table>
    <tr><th>Emir</th><th>Ne işe yarar?</th></tr>
    <tr><td>Piyasa</td><td>Güncel fiyattan hemen alım / satım</td></tr>
    <tr><td>Limit</td><td>Belirlediğiniz fiyata gelince işlem</td></tr>
    <tr><td>Zarar durdur</td><td>Fiyat düşerse pozisyonu otomatik kapatır</td></tr>
    <tr><td>Kâr al</td><td>Hedef fiyatta kârı realize eder</td></tr>
    <tr><td>Takip eden stop</td><td>Yükselişi izler, belirlenen mesafeyle korur</td></tr>
    <tr><td>Açılışta gerçekleştir</td><td>Borsa kapalıyken verilen emir açılışta işlenir</td></tr>
  </table>
  <div class="calc">
    <p class="kicker">Maliyet örneği</p>
    <div class="cl"><span>İşlem tutarı</span><b>10.000 TL</b></div>
    <div class="cl"><span>Alış komisyonu (%0,25)</span><b>25 TL</b></div>
    <div class="cl"><span>Satış komisyonu (%0,25)</span><b>25 TL</b></div>
    <div class="cl tot"><span>Bir tam al-sat maliyeti</span><b>%0,50</b></div>
    <p class="calc-n">Ayda 4 tam al-sat, sermayenin tamamıyla yapılırsa yılda yaklaşık <b>%{tr(YEAR_COST,1)}</b> maliyet demektir. Sık işlem, getiriyi sessizce aşındırır.</p>
  </div>
</div>""" + note("Dövizde alış ve satış kuru ayrıdır (kur makası); %25 / %50 / %100 kısayollarıyla pozisyon kısmen kapatılabilir."))

feature("Portföy", "Pozisyon, maliyet ve kâr / zarar", [
    "Ortalama maliyet ve anlık kâr / zarar",
    "Varlık sınıfı dağılımı ve değer geçmişi",
    "Bekleyen emirler: limit, zarar durdur, takip eden stop",
    "Tüm işlem geçmişi ve rozetler",
], "portfolio", flip=True)

# § 2
section("2", "Risk, getiri ve portföy", "Ekonominin temel dengesi")
add(head("Temel kavramlar", "Getiriye bakmadan önce riske bakın") + f"""
<div class="concepts">
  <div class="rr">{RR_SVG}<p class="cap">Kavramsal gösterim, ölçeksizdir.</p></div>
  <div class="defs">
    <div class="df"><h3>Getiri</h3><p>Bir dönemde değerdeki yüzde değişim.</p></div>
    <div class="df"><h3>Oynaklık (volatilite)</h3><p>Getirilerin ortalamadan ne kadar saptığı; riskin en yaygın ölçüsü.</p></div>
    <div class="df"><h3>Maksimum düşüş</h3><p>Zirveden en dip noktaya kadar yaşanan en büyük kayıp.</p></div>
    <div class="df"><h3>Korelasyon</h3><p>İki varlığın birlikte hareket etme eğilimi; düşük korelasyon çeşitlendirmenin anahtarıdır.</p></div>
  </div>
</div>""")
add(head("Çeşitlendirme", "Varlık sayısı arttıkça risk azalır — ama sıfırlanmaz") + f"""
<div class="chartrow">
  <div class="chartbox">{DIV_SVG}</div>
  <div class="side">
    <p class="big">%{tr(DIV_SP[0],1)} → %{tr(DIV_SP[9],1)}</p>
    <p>Tek varlıktan on varlığa geçmek, bu örnekte portföy oynaklığını yaklaşık <b>%{tr((1-DIV_SP[9]/DIV_SP[0])*100)}</b> azaltır.</p>
    <p>Kalan kısım tüm piyasayı etkileyen ortak risktir; çeşitlendirmeyle giderilemez.</p>
  </div>
</div>""" + note("Varsayım: her varlığın yıllık oynaklığı %30, varlık çiftleri arası korelasyon 0,3, eşit ağırlık. σₚ = √(σ²/n + (1 − 1/n)·ρ·σ²)."))
add(head("Belirsizlik", "Gelecek tek bir sayı değil, bir olasılık aralığıdır") + f"""
<div class="chartrow">
  <div class="chartbox">{FAN_SVG}</div>
  <div class="side">
    <p class="big">{tr(FAN_END[50]/1000)} bin TL</p>
    <p>10 yıl sonra <b>medyan</b> sonuç. Senaryoların yarısı bunun altında, yarısı üstünde.</p>
    <p>Senaryoların <b>%90’ı</b> {tr(FAN_END[5]/1000)} bin – {tr(FAN_END[95]/1000)} bin TL arasında.</p>
    <p>Başlangıç değerinin altında kalma olasılığı: <b>%{tr(FAN_LOSS,1)}</b></p>
  </div>
</div>""" + note("Örnek Monte Carlo simülasyonu: 100.000 TL başlangıç, yıllık beklenen getiri %8, oynaklık %15, 2.000 senaryo (geometrik Brown hareketi). Portföy Sihirbazı aynı yöntemi kişisel dağılımınıza uygular."))
feature("Portföy Sihirbazı", "Risk profilinize uygun dağılım", [
    "8 soruluk risk anketi → 5 risk profili",
    "<b>Modern portföy teorisi</b> ile kısıtlı optimizasyon",
    "<b>Monte Carlo</b>: beklenen getiri aralığı, zarar olasılığı, maksimum düşüş",
    "Önerilen dağılımı tek tıkla sanal portföyünüze uygulayın",
], "advisor", foot="Sihirbazın önerileri eğitim amaçlıdır; yatırım tavsiyesi değildir.")
add(head("100.000 USD Model Portföy", "Dağıtın, sınayın, karşılaştırın") + f"""
<div class="model">
  <div>{shot("model", "shot small")}<p class="cap">Dağılım, nakdin yeri ve her varlığın toplam getiriye katkısı</p></div>
  <div class="calc whatif">
    <p class="kicker">“Ya … olursa?”</p>
    <p class="wf">Bir varlığın portföye etkisi = <b>ağırlık × değişim</b></p>
    <div class="cl"><span>Kripto ağırlığı</span><b>%20</b></div>
    <div class="cl"><span>Kripto fiyatı</span><b class="neg">−%30</b></div>
    <div class="cl tot"><span>Portföye etkisi</span><b class="neg">−%6</b></div>
    <p class="calc-n">Modeller yan yana karşılaştırılır: getiri, oynaklık, maksimum düşüş ve çeşitlendirme.</p>
  </div>
</div>""")
feature("Global Portföy Lab", "Yerel piyasanın ötesine bakın", [
    "48 küresel yatırım aracı: bölge, varlık sınıfı, para birimi, risk seviyesi",
    "Alternatifleri sınıflandırın ve yan yana karşılaştırın",
    "Senaryo ve <b>stres testi</b>: 2008, 2020, 2022 ve TL şoku",
    "Coğrafi ve para birimi çeşitlendirmesini ölçün",
], "globallab", flip=True, foot="Senaryo varsayımları örnek değerlerdir ve kaynaklarıyla birlikte güncellenir.")

# § 3
section("3", "Oyunlaştırılmış öğrenme", "Kısa turlarda karar verme pratiği")
feature("Oyun Merkezi", "Oynayarak pratik yapın", [
    "Euro/dolar, altın, petrol ve Bitcoin ile 1–10 dakikalık turlar",
    "Fiyatlar gerçek bir geçmiş dönemin <b>hızlandırılmış tekrarıdır</b>; tarih tur sonunda açıklanır",
    "Her turdan sonra kişisel karne: risk, disiplin, işlem kalitesi, sonuç",
    "Jetonlar ve ödüller yalnızca oyun içidir",
], "oyun")
add(head("Oyun modları", "Farklı beceriler için farklı formatlar") + """
<div class="modes">
  <div class="md"><h3>Hızlı Maç ve Düello</h3><p>Bire bir, aynı fiyat akışında kim daha iyi karar verir?</p></div>
  <div class="md"><h3>Solo Tur</h3><p>1–10 dakika; tur sonunda A–E arası karne ve öneriler.</p></div>
  <div class="md"><h3>Meydan Okumalar</h3><p>Planlanmış, herkesin aynı anda katıldığı canlı etkinlikler.</p></div>
  <div class="md"><h3>Senaryolar</h3><p>Tarihi piyasa olaylarını yeniden oynayın: brifing → tur → “Ne oldu?”</p></div>
  <div class="md"><h3>Yatırım İmparatorluğu</h3><p>Geliri gerçek piyasa hareketlerine bağlı, bileşik büyüme oyunu.</p></div>
  <div class="md"><h3>Haftalık Seçim</h3><p>Bağımsız tahmin, ardından kitlenin ortak seçimiyle kıyas.</p></div>
  <div class="md"><h3>Çark ve görevler</h3><p>Günlük görevler, seri ve ücretsiz günlük çark.</p></div>
  <div class="md"><h3>Slot Makinesi</h3><p>Beklenen değer dersi: oranlar ve kasa payı her zaman açık.</p></div>
</div>""")
add(head("Haftalık Seçim — Kitlelerin bilgeliği", "Önce bağımsız karar, sonra ortak akıl") + """
<div class="tl">
  <div class="tst"><p class="when">Cumartesi 00:00</p><h3>Gizli seçim</h3><p>Herkes tek başına bir varlık ve yön seçer; diğer seçimler görünmez.</p></div>
  <div class="tst"><p class="when">Pazar 15:00</p><h3>Açılış</h3><p>Tüm seçimler ve kitlenin tercihi aynı anda açıklanır.</p></div>
  <div class="tst"><p class="when">Pazartesi → Cuma</p><h3>Ölçüm</h3><p>Getiriler varlıkların kendi para biriminde izlenir.</p></div>
  <div class="tst"><p class="when">Cumartesi</p><h3>Sonuç</h3><p>Eşit ağırlıklı kitle portföyü bireylerle karşılaştırılır.</p></div>
</div>""" + note("Bağımsız tahminlerin ortalaması, çoğu zaman tek tek tahminlerin büyük kısmından daha isabetlidir — yeter ki kararlar birbirinden etkilenmeden verilsin (Dr. Alexander Elder’ın anlattığı SpikeTrade yarışmasından uyarlanmıştır)."))
add(head("İki temel ders", "Bileşik getiri ve beklenen değer") + f"""
<div class="lessons">
  <div class="ls"><h3>Bileşik getiri <span>— Yatırım İmparatorluğu</span></h3><div class="chartbox sm">{COMP_SVG}</div>
    <p class="cap">Dönem başına %10: 20 dönemde basit getiri {tr(SIMP_END)}’e, bileşik getiri {tr(COMP_END)}’e ulaşır. Kazancı yeniden yatırmak büyümeyi hızlandırır.</p></div>
  <div class="ls"><h3>Beklenen değer <span>— Slot Makinesi</span></h3><div class="chartbox sm">{EV_SVG}</div>
    <p class="cap">Geri ödeme oranı %95, kasa payı %5. Negatif beklenen değerli bir oyunda, oynadıkça sonuç kayba yaklaşır.</p></div>
</div>""")

# Kapanış
add(f"""
<div class="cover end">
  <div class="cover-logo">{mark(96)}{wordmark(80, light=True)}</div>
  <h1>Kararlarınızı gerçek piyasada,<br><em>sanal parayla</em> sınayın.</h1>
  <p class="cover-sub">Ücretsiz · Gerçek piyasa verisi · TL ve USD</p>
  <p class="disc">PortfoyGo bir eğitim ve simülasyon platformudur. Gerçek para yatırılamaz ve çekilemez; içerikler yatırım tavsiyesi değildir.</p>
</div>""", "navy")

# ---------------------------------------------------------------- HTML
N = len(slides)
def footer(i, theme):
    if theme == "navy":
        return ""
    return f'<footer class="ft">{mark(26)}<span>PortfoyGo</span><span class="sep">·</span><span>Kullanıcı tanıtımı</span><span class="pg">{i + 1}</span></footer>'

body = "\n".join(
    f'<section class="slide t-{theme}" aria-roledescription="slide" aria-label="{i + 1} / {N}"><div class="inner">{html}</div>{footer(i, theme)}</section>'
    for i, (html, theme) in enumerate(slides)
)

CSS = r"""
:root{--paper:#F6F5F1;--paper2:#EFEDE6;--ink:#111827;--ink2:#2B3442;--muted:#5B6474;--rule:#DAD6CC;--brand:#465FFF;--brand-d:#2B3BB8;--brand-l:#8FA2FF;--navy:#0C1730;--green:#0E9F6E;--red:#D92D20;--orange:#E8890C;
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;--sans:Inter,"Segoe UI",system-ui,-apple-system,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#03060c;overflow:hidden;font-family:var(--sans);-webkit-font-smoothing:antialiased;color:var(--ink)}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center center}
.slide{position:absolute;inset:0;background:var(--paper);opacity:0;visibility:hidden;transition:opacity .5s ease;overflow:hidden}
.slide.on{opacity:1;visibility:visible}
.inner{position:absolute;inset:0;padding:96px 128px 150px;display:flex;flex-direction:column}
.t-navy{background:radial-gradient(1400px 800px at 100% 0%,rgba(70,95,255,.28),transparent 60%),var(--navy);color:#EEF1F7}
.t-navy .inner{justify-content:center}
/* başlık bloğu */
.hd{margin-bottom:48px}
.eyebrow{display:flex;align-items:center;gap:14px;font-size:24px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-d)}
.eyebrow i{display:block;width:28px;height:14px;background:var(--brand)}
.title{font-family:var(--serif);font-size:64px;font-weight:600;line-height:1.1;letter-spacing:-.01em;margin-top:18px;max-width:1500px}
.dek{font-size:30px;color:var(--muted);margin-top:14px}
.hd::after{content:"";display:block;height:2px;background:var(--ink);margin-top:30px;width:120px}
/* metin */
.bl{list-style:none;display:flex;flex-direction:column;gap:22px}
.bl li{font-size:30px;line-height:1.42;color:var(--ink2);padding-left:34px;position:relative}
.bl li::before{content:"";position:absolute;left:0;top:18px;width:16px;height:2px;background:var(--brand)}
.bl b{color:var(--ink)}
.note{position:absolute;left:128px;right:128px;bottom:96px;font-size:22px;line-height:1.45;color:var(--muted);border-top:1px solid var(--rule);padding-top:14px}
.cap{font-size:24px;color:var(--muted);margin-top:16px;line-height:1.45}
.kicker{font-size:22px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-d);margin-bottom:12px}
/* kapak */
.cover h1{font-family:var(--serif);font-size:96px;font-weight:500;line-height:1.06;letter-spacing:-.015em;color:#fff;max-width:1500px}
.cover h1 em{font-style:italic;color:var(--brand-l)}
.cover-logo{display:flex;align-items:center;gap:30px;margin-bottom:84px}
.cover-sub{font-size:36px;color:#C3CBDD;margin-top:34px;max-width:1300px;line-height:1.4}
.cover-meta{font-size:26px;color:#8D98B3;margin-top:110px;letter-spacing:.1em;text-transform:uppercase}
.end h1{font-size:84px}
.disc{font-size:24px;color:#8D98B3;margin-top:110px;max-width:1300px;line-height:1.5;border-top:1px solid rgba(255,255,255,.15);padding-top:22px}
.wm{font-family:Outfit,var(--sans);font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.wm b{color:var(--brand)}
.wm-l{color:#fff}.wm-l b{color:var(--brand-l)}
/* bölüm */
.sect-n{font-family:var(--serif);font-size:220px;font-weight:400;line-height:1;color:var(--brand-l);opacity:.9}
.sect h2{font-family:var(--serif);font-size:110px;font-weight:500;letter-spacing:-.015em;margin-top:20px;color:#fff}
.sect p{font-size:40px;color:#C3CBDD;margin-top:24px}
/* düzenler */
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:56px;margin-top:10px}
.col{border-top:2px solid var(--ink);padding-top:28px}
.col h3,.card h3{font-family:var(--serif);font-size:40px;font-weight:600;margin-bottom:16px}
.col p,.card p{font-size:28px;line-height:1.5;color:var(--ink2)}
.cards .card{background:#fff;border:1px solid var(--rule);padding:44px 44px 48px;border-top:6px solid var(--brand)}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:30px;border-top:2px solid var(--ink)}
.st{padding:36px 36px 0 0}
.sn{font-family:var(--serif);font-size:96px;color:var(--brand);line-height:1;margin-bottom:22px}
.st h3{font-family:var(--serif);font-size:38px;font-weight:600;margin-bottom:12px}
.st p{font-size:27px;color:var(--ink2);line-height:1.45}
.feature{display:grid;grid-template-columns:600px 1fr;gap:72px;align-items:center;flex:1}
.feature.flip{grid-template-columns:1fr 600px}
.feature .hd{margin-bottom:36px}
.feature .title{font-size:56px}
.shot{background:#fff;border:1px solid var(--rule);border-radius:10px;overflow:hidden;box-shadow:0 24px 50px rgba(17,24,39,.10)}
.shot img{display:block;width:100%;height:auto}
.orders{display:grid;grid-template-columns:1.25fr 1fr;gap:64px;align-items:start}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:18px 18px;font-size:27px;border-bottom:1px solid var(--rule)}
th{font-size:21px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border-bottom:2px solid var(--ink)}
td:first-child{font-weight:700;white-space:nowrap;color:var(--ink)}
td{color:var(--ink2)}
.calc{background:#fff;border:1px solid var(--rule);padding:36px 40px}
.cl{display:flex;justify-content:space-between;align-items:baseline;font-size:28px;padding:14px 0;border-bottom:1px solid var(--rule)}
.cl span{color:var(--ink2)}.cl b{font-variant-numeric:tabular-nums}
.cl.tot{border-bottom:none;border-top:2px solid var(--ink);margin-top:6px;font-size:32px}
.cl.tot b{color:var(--brand-d)}
.neg{color:var(--red)!important}
.calc-n{font-size:24px;color:var(--muted);line-height:1.5;margin-top:18px}
.calc-n b{color:var(--ink)}
.concepts{display:grid;grid-template-columns:1.1fr 1fr;gap:64px;align-items:center}
.rr .chart{width:100%;height:auto}
.defs{display:grid;grid-template-columns:1fr 1fr;gap:36px 40px}
.df{border-top:2px solid var(--ink);padding-top:18px}
.df h3{font-family:var(--serif);font-size:34px;font-weight:600;margin-bottom:10px}
.df p{font-size:25px;line-height:1.45;color:var(--ink2)}
.chartrow{display:grid;grid-template-columns:1.45fr 1fr;gap:64px;align-items:center}
.chartbox .chart{width:100%;height:auto;display:block}
.chart text{font-family:var(--sans)}
.chart .tk{font-size:22px;fill:var(--muted)}
.chart .ax{font-size:23px;fill:var(--ink2);font-weight:600}
.chart .lbl{font-size:24px;font-weight:600}
.chart .val{font-size:26px;font-weight:700;fill:var(--ink)}
.chart .bigv{font-size:40px;font-weight:700}
.side .big{font-family:var(--serif);font-size:70px;font-weight:600;color:var(--brand-d);line-height:1.05;margin-bottom:24px}
.side p{font-size:28px;line-height:1.5;color:var(--ink2);margin-bottom:18px}
.model{display:grid;grid-template-columns:1.45fr 1fr;gap:64px;align-items:start}
.wf{font-size:30px;margin-bottom:14px}
.modes{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:2px solid var(--ink)}
.md{padding:32px 32px 36px 0;border-bottom:1px solid var(--rule)}
.md h3{font-family:var(--serif);font-size:34px;font-weight:600;margin-bottom:10px}
.md p{font-size:25px;line-height:1.45;color:var(--ink2)}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative;margin-top:16px}
.tl::before{content:"";position:absolute;left:0;right:0;top:30px;height:2px;background:var(--ink)}
.tst{position:relative;padding:72px 40px 0 0}
.tst::before{content:"";position:absolute;left:0;top:20px;width:22px;height:22px;background:var(--brand)}
.when{font-size:22px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--brand-d);margin-bottom:12px}
.tst h3{font-family:var(--serif);font-size:38px;font-weight:600;margin-bottom:12px}
.tst p{font-size:26px;line-height:1.45;color:var(--ink2)}
.lessons{display:grid;grid-template-columns:1fr 1fr;gap:64px}
.ls h3{font-family:var(--serif);font-size:38px;font-weight:600;margin-bottom:18px}
.ls h3 span{font-family:var(--sans);font-size:24px;font-weight:500;color:var(--muted)}
.chartbox.sm{background:#fff;border:1px solid var(--rule);padding:18px}
/* alt bilgi */
.ft{position:absolute;left:128px;right:128px;bottom:44px;display:flex;align-items:center;gap:12px;font-size:21px;color:var(--muted);font-weight:500}
.ft span:first-of-type{font-weight:700;color:var(--ink)}
.ft .sep{opacity:.5}
.ft .pg{margin-left:auto;font-family:var(--serif);font-size:26px;color:var(--ink)}
#ui{position:fixed;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.06);z-index:5}
#bar{height:100%;width:0;background:#465FFF;transition:width .35s ease}
@media print{
  @page{size:1920px 1080px;margin:0}
  html,body{overflow:visible;background:#fff}
  #stage{position:static;transform:none!important;width:1920px;height:auto}
  .slide{position:relative;opacity:1;visibility:visible;width:1920px;height:1080px;break-after:page}
  #ui{display:none}
}
@media (prefers-reduced-motion:reduce){.slide{transition:none}}
"""

JS = r"""
(function(){
  var stage=document.getElementById('stage'),slides=[].slice.call(document.querySelectorAll('.slide')),bar=document.getElementById('bar');
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
})();
"""

html = f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PortfoyGo — Kullanıcı Tanıtımı</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..600&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
<div id="stage">
{body}
</div>
<div id="ui"><div id="bar"></div></div>
<script>{JS}</script>
</body>
</html>
"""
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"{N} slayt → {OUT} ({OUT.stat().st_size/1024/1024:.1f} MB)")
print(f"çeşitlendirme 1/10: {DIV_SP[0]:.1f} / {DIV_SP[9]:.1f} · MC medyan {FAN_END[50]:.0f} p5 {FAN_END[5]:.0f} p95 {FAN_END[95]:.0f} kayıp% {FAN_LOSS:.1f} · yıllık maliyet {YEAR_COST:.1f}")
