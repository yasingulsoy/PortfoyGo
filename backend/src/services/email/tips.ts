/**
 * Haftalık özetteki kısa eğitim notları. Yatırım tavsiyesi DEĞİLDİR; genel kavramları anlatır.
 * Hafta numarasına göre sırayla döner (aynı hafta herkese aynı not).
 */

export interface DigestTip {
  title: string;
  body: string;
}

export const DIGEST_TIPS: readonly DigestTip[] = [
  {
    title: 'Çeşitlendirme',
    body: 'Tüm bakiyeyi tek bir varlığa yatırmak, o varlıktaki her dalgalanmayı doğrudan portföyüne taşır. Farklı varlık türlerine yayılmak riski dengelemeye yardımcı olur.',
  },
  {
    title: 'Zarar durdur emri',
    body: 'Bir pozisyona girmeden önce "nerede yanıldığımı kabul ederim?" sorusunu yanıtla. Zarar durdur emri bu kararı önceden vermeni ve duygusal satışlardan kaçınmanı sağlar.',
  },
  {
    title: 'Volatilite nedir?',
    body: 'Volatilite, fiyatın ne kadar sert ve sık oynadığının ölçüsüdür. Yüksek volatilite büyük kazanç kadar büyük kayıp ihtimali de demektir; pozisyon büyüklüğünü buna göre ayarla.',
  },
  {
    title: 'Bileşik getiri',
    body: 'Küçük ama düzenli getiriler zamanla birikir: %1’lik haftalık artış bir yılda kabaca %68’e ulaşır. Tutarlılık çoğu zaman tek seferlik büyük vuruşlardan daha değerlidir.',
  },
  {
    title: 'Komisyonun etkisi',
    body: 'Her alım-satım küçük bir maliyet yaratır. Çok sık işlem yapmak, getirini fark etmeden aşındırabilir; işlem sayısını değil, kararlarının kalitesini artırmaya odaklan.',
  },
  {
    title: 'Kayıptan kaçınma',
    body: 'İnsanlar kaybı, aynı büyüklükteki kazançtan daha güçlü hisseder. Bu yüzden zarardaki pozisyonu "dönsün" diye tutmak cazip gelir. Planına sadık kalmak bu tuzağı azaltır.',
  },
  {
    title: 'Pozisyon büyüklüğü',
    body: 'Tek bir işlemde portföyün küçük bir kısmını riske atmak, birkaç hatalı kararın ardından bile oyunda kalmanı sağlar. Kazanmak kadar hayatta kalmak da önemlidir.',
  },
  {
    title: 'Düzenli alım',
    body: 'Belirli aralıklarla sabit tutarda alım yapmak (ortalama maliyet stratejisi), "doğru zamanı" tahmin etme baskısını azaltır ve maliyetini zamana yayar.',
  },
  {
    title: 'Kur etkisi',
    body: 'Dolar bazlı bir varlık kendi piyasasında yerinde saysa bile, USD/TRY değiştiğinde TL karşılığı değişir. Getirini değerlendirirken kur hareketini de hesaba kat.',
  },
  {
    title: 'Haber ve fiyat',
    body: 'Beklenen bir haber çoğu zaman açıklanmadan fiyatlanır. "Söylentide al, haberde sat" deyimi bu yüzden vardır; habere tepki vermeden önce fiyatın neyi zaten içerdiğini düşün.',
  },
  {
    title: 'Kalabalığın bilgeliği',
    body: 'Bağımsız tahminlerin ortalaması çoğu zaman tek tek tahminlerden isabetlidir. Haftalık Seçim’de önce kendi kararını ver, sonra kitlenin ne düşündüğüne bak.',
  },
  {
    title: 'Bir günlük hareket',
    body: 'Tek günlük sert bir yükseliş ya da düşüş, uzun vadeli eğilim hakkında az şey söyler. Grafiğe farklı zaman aralıklarında bakmak daha dengeli bir resim verir.',
  },
];

/** '2026-W41' → o haftanın notu (hafta numarasına göre döngüsel). */
export function tipForWeek(weekKey: string): DigestTip {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  const n = m ? parseInt(m[1], 10) * 53 + parseInt(m[2], 10) : 0;
  return DIGEST_TIPS[((n % DIGEST_TIPS.length) + DIGEST_TIPS.length) % DIGEST_TIPS.length];
}
