# PortfoyGo — Mevcut Ürün Yetenekleri (Durum Raporu)

**Özet:** PortfoyGo, gerçek piyasa verileriyle çalışan bir **sanal yatırım ve borsa simülasyonu** platformudur. Kullanıcılar gerçek para riski olmadan alım-satım deneyimleyebilir, portföylerini takip edebilir ve birbirleriyle rekabete girebilir. Aşağıda, bugün itibarıyla platformda **yapılabilen** başlıca yetenekler, yönetici özeti niteliğinde ve pazarlama/raporlama dilinde özetlenmiştir.

---

## Veri altyapısı ve maliyet avantajı

Platform, fiyat ve piyasa bilgisini sektörde yaygın **ücretsiz (free) API katmanları** üzerinden beslenmek üzere tasarlanmıştır. Kripto tarafında CoinGecko; hisse, grafik ve emtia tarafında Finnhub; yedek ve alternatif ihtiyaçlarda Alpha Vantage kullanımı söz konusudur. Döviz ve kur verileri Nosy API üzerinden alınabilmektedir. Haber akışı ise ayrı bir pahalı “kurumsal market data lisansı” yerine, güncel içeriği dış kaynaktan düzenli çeken bir yapı ile sunulmaktadır.

Bu model, **başlangıç ve büyüme aşamasında operasyonel maliyeti düşürür** ve “gerçek veriyle çalışan demo / eğitim ürünü” hikâyesini sürdürülebilir kılar. Dış tarafta tüm sağlayıcıların kendi **kotaları, hız sınırları ve kullanım koşulları** bulunduğundan, kullanıcı veya eşzamanlı istek sayısı arttıkça cache, anahtar çeşitlendirme veya ücretli plana geçiş gibi adımlar gündeme gelebilir. Bugünkü kapsamda ücretsiz katmanlar, **geliştirme, pilot ve sınırlı ölçekte canlı kullanım** için yeterlidir; yoğun üretim yükü altında altyapı planlaması ayrıca değerlendirilmelidir.

---

## Kullanıcı ne yapabiliyor? (Hesap ve deneyim)

Kullanıcı e-posta ve şifre ile hesap açabiliyor, giriş yapabiliyor; e-posta doğrulama altyapısı mevcut olup, özellikle liderlik ve güven puanı gibi alanlarda “doğrulanmış hesap” beklentisi uygulanabiliyor. Her yeni hesaba **100.000 ₺ tutarında sanal bakiye** tanımlanarak, “sıfırdan portföy büyütme” deneyimi standart hale getiriliyor. Arayüz koyu ve açık tema ile **mobil ve masaüstüne uyumlu** sunulmaktadır; böylece hem ofis hem mobil kullanım senaryoları cevaplanmaktadır.

---

## Piyasa takibi

Platform üzerinde **hisse senetleri, kripto paralar, emtialar ve döviz kurları** izlenebilmektedir. Fiyatlar, kaynaklara göre belirli aralıklarla **otomatik yenilenmekte**; kullanıcı varlık bazında **canlı fiyat grafikleri** üzerinden teknik fiyat hareketini inceleyebilmektedir. Bu, ürünü sadece “al-sat ekranı” olmaktan çıkarıp, **eğitim ve analiz** tarafında da anlamlı kılar.

---

## Alım-satım ve portföy yönetimi

Kullanıcı, hisse, kripto, emtia ve döviz alıp satabilmekte; işlemlerde **%0,1 oranında komisyon** uygulanarak gerçek piyasaya benzer maliyet farkındalığı yaratılmaktadır. Sistem, ortalama maliyet ve anlık kâr/zararı hesaplayabilmekte; tüm hareketler **işlem geçmişi** altında tutulmaktadır. **Stop-loss (zarar durdurma)** ile belirli bir fiyatın altına inildiğinde otomatik satış tetiklenebilmekte; bu da risk yönetimini eğlencenin ötesine taşır. Portföy ekranı üzerinde toplam değer, varlık dağılımı ve performans özetlenerek kullanıcıya **tek ekranda netlik** sağlanır.

---

## Rekabet, oyunlaştırma ve içerik

Kullanıcılar, performansa göre **liderlik tablosunda** yer alabilmekte; farklı zaman pencereleri (ör. tüm zamanlar, haftalık) üzerinden sıralama sunulabilmektedir. **Rozet ve başarı** sistemi ile işlem sayısı, kâr eşiği, portföy büyüklüğü gibi hedeflere ulaştıkça motivasyon artırılmaktadır. Ek olarak **ekonomi ve finans haber akışı** sunularak, kullanıcının sadece fiyat değil **bağlam** (haber) ile de etkileşimde kalması hedeflenmektedir.

---

## Yönetim ve operasyon

Yönetici tarafı için **admin API’leri** ile kullanıcı ve platform istatistiklerine dönük yönetim ihtiyaçları karşılanmaktadır. Bu, pilot dönemde operasyonu izlemek ve sonraki aşamada ürünü ölçeklendirmek için temel teşkil eder.

---

**Sonuç:** PortfoyGo bugün, **“gerçek veri + sanal para + rekabet + eğitim”** formülünü uçtan uca sunabilecek seviyededir. Gerçek para yatırmadan yatırım disiplinini ve piyasa dinamiklerini deneyimletmek isteyen kurumlar, eğitim verenler veya tüketici pazarı için **düşük maliyetli veri entegrasyonu** ile hızlı prototip / demo hattı anlamına gelmektedir. Üretim ölçeğinde büyüme için dış veri lisansı ve altyapı kotalarının ayrıca planlanması önerilir.

*İlgili teknik ayrıntı ve yol haritası:* [UYGULAMA_KABILITELERI_VE_YOL_HARITASI.md](./UYGULAMA_KABILITELERI_VE_YOL_HARITASI.md)
