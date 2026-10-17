# Sunum üretimi

`docs/sunum/PortfoyGo_Sunum.html` — tek dosyalık tanıtım sunumu (görseller gömülü, internetsiz açılır).
Tarayıcıda aç: **→ / ←** geç, **F** tam ekran, **Home / End** baş / son. Yazdır → PDF ile her slayt bir sayfa olur.

Ekranlar değişince yeniden üretmek için (yerel yığın açıkken: `npm run dev:local`):

```bash
node scripts/sunum/shots.js
python scripts/sunum/build_deck.py scripts/sunum/shots docs/sunum/PortfoyGo_Sunum.html
```

`shots.js` demo hesabıyla uygulamanın ekran görüntülerini alır (`scripts/sunum/shots/`, git'e girmez); `build_deck.py` slaytları ve görselleri tek HTML'de birleştirir (Python + Pillow).
