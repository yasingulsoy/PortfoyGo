# PortfoyGo — Kullanıcı Sunumu Rehberi

Ekrandaki sunum: [`docs/sunum/PortfoyGo_Sunum.html`](sunum/PortfoyGo_Sunum.html) (23 slayt; **→ / ←** geç, **F** tam ekran).
Bu dosya yalnızca sunan kişi içindir: her slaytta kısaca **ne söyleneceği**. Süre: ~12–15 dakika.

**Ton:** Sakin, ölçülü, bir ekonomistin anlatacağı gibi. Abartılı vaat yok; "kazandırır" değil "öğrenmenizi, ölçmenizi sağlar". PortfoyGo eğitim ve simülasyon platformudur; yatırım tavsiyesi değildir.

---

| # | Slayt | Söylenecek ana fikir |
| --- | --- | --- |
| 1 | Kapak | "PortfoyGo; gerçek piyasa verisiyle, sanal parayla yatırım yapmanızı sağlayan bir platform." |
| 2 | Neden PortfoyGo? | Risk ve getiri ayrılmaz; deneyim genelde gerçek parayla, pahalıya kazanılır. Simülasyon aynı kararları maliyetsiz sınamanın yolu. |
| 3 | PortfoyGo nedir? | Üç ayak: simülasyon (100.000 TL sanal bakiye), eğitim (risk profili, portföy önerisi, geri bildirim), rekabet (turlar, yarışmalar). |
| 4 | Nasıl çalışır? | Dört adım: kayıt → sanal bakiye → karar → ölçüm. |
| 5 | § 1 Piyasalar ve işlem | — |
| 6 | Panel | Toplam varlık, performans grafiği ve dağılım tek ekranda. |
| 7 | Piyasalar | Dört varlık sınıfı; fiyatlar TL veya USD görülebilir; fiyatı sunucu belirler, herkes için aynıdır. |
| 8 | Varlık sayfası | Karar vermeden önce grafiği ve performansı inceleyin; ABD borsası açık/kapalı bilgisi. |
| 9 | Emir tipleri ve maliyet | Gerçek borsadaki emir tipleri. **Maliyet örneği:** %0,25 komisyonla bir tam al-sat %0,50; ayda 4 tam al-sat yılda ~%21 maliyet → sık işlem getiriyi aşındırır. |
| 10 | Portföy | Ortalama maliyet, kâr/zarar, bekleyen emirler. |
| 11 | § 2 Risk, getiri ve portföy | — |
| 12 | Temel kavramlar | Getiri, oynaklık, maksimum düşüş, korelasyon. Grafik kavramsal: risk arttıkça beklenen getiri artar. |
| 13 | Çeşitlendirme | Formülle hesaplanmış örnek: 1 varlıktan 10 varlığa geçmek oynaklığı ~%39 düşürür; piyasa riski (~%16) kalır. |
| 14 | Belirsizlik | Monte Carlo örneği: 10 yıl sonra medyan ~195 bin TL, senaryoların %90'ı 90–428 bin TL arası; kayıp olasılığı ~%8. "Gelecek tek sayı değil, aralık." |
| 15 | Portföy Sihirbazı | Risk anketi → profil → modern portföy teorisi ile önerilen dağılım; tek tıkla uygulama. Tavsiye değil. |
| 16 | Model Portföy | 100.000 USD'yi dağıtın; bir varlığın etkisi = ağırlık × değişim (ör. %20 kripto, −%30 → portföy −%6); modelleri karşılaştırın. |
| 17 | Global Portföy Lab | Küresel araçlar, sınıflandırma, stres testleri (2008, 2020, 2022, TL şoku). |
| 18 | § 3 Oyunlaştırılmış öğrenme | — |
| 19 | Oyun Merkezi | Kısa turlar, gerçek geçmiş fiyatların hızlandırılmış tekrarı, tur sonu karne. Jetonlar yalnızca oyun içi. |
| 20 | Oyun modları | Düello, solo tur, meydan okumalar, senaryolar, İmparatorluk, Haftalık Seçim, görevler, slot (olasılık dersi). |
| 21 | Haftalık Seçim | Önce bağımsız karar, sonra ortak akıl; kitle portföyü bireylerle kıyaslanır. |
| 22 | İki temel ders | Bileşik getiri (kazancı yeniden yatırmak) ve beklenen değer (%95 geri ödeme → oynadıkça kayba yaklaşılır). |
| 23 | Kapanış | "Kararlarınızı gerçek piyasada, sanal parayla sınayın." + yasal not. |

---

## Sunumdan önce

1. Sunumu tarayıcıda aç, **F** ile tam ekran yap.
2. Canlı uygulama da göstermek istersen: `npm run dev:local` → `http://localhost:3000` (yerelde otomatik demo girişi).

## Olası sorular

| Soru | Kısa cevap |
| --- | --- |
| Fiyatlar gerçek mi? | Gerçek piyasa verisi kullanılıyor; oyun turları gerçek geçmiş fiyatların hızlandırılmış tekrarı. |
| Gerçek para var mı? | Hayır. Para yatırılamaz, çekilemez; jetonlar yalnızca oyun içi. |
| Yatırım tavsiyesi mi? | Hayır; öneriler ve analizler eğitim amaçlı. |
| Ücretli mi? | Temel kullanım ücretsiz; Global Portföy Lab senaryoları premium. |
| Verilerim? | Kendi verinizi indirebilir, hesabınızı silebilirsiniz (KVKK). |

*Ekranlar değişince sunumu yeniden üretmek için: [`scripts/sunum/README.md`](../scripts/sunum/README.md).*
