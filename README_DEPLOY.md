# Dokploy Deployment Guide

## Frontend Deployment

### Environment Variables (Dokploy'da ayarlanmalı)

Dokploy'da frontend için şu environment variable'ları ayarlayın:

```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://api.sailkeep.com/api
```

### Önemli Notlar

1. **Port Ayarları**: 
   - Next.js otomatik olarak `PORT` environment variable'ını kullanır
   - Dokploy'da PORT ayarlanmazsa varsayılan olarak 3000 kullanılır
   - Loglarda `localhost:3000` görünmesi normaldir, bu sadece bilgilendirme amaçlıdır

2. **Loglar**:
   - Next.js production modunda loglar console'a yazılır
   - Dokploy'da logları görmek için container loglarını kontrol edin
   - Request logları için middleware kullanılabilir

3. **Build ve Start**:
   ```bash
   npm run build  # Production build
   npm start      # Production server başlat
   ```

### Logları Görmek İçin

Dokploy'da:
1. Container'a gidin
2. "Logs" sekmesine tıklayın
3. Veya terminal'den: `docker logs <container-name>`

### Sorun Giderme

- **Loglar görünmüyor**: Container loglarını kontrol edin
- **Port sorunu**: PORT environment variable'ını kontrol edin
- **API bağlantı sorunu**: NEXT_PUBLIC_API_URL'yi kontrol edin

