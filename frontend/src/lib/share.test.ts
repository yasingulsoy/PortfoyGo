import { describe, expect, it, vi } from 'vitest';
import { idleShareText, picksShareText, shareClipboardText, shareOrCopy, shareStatusLabel, type ShareNavigator } from './share';

const PAYLOAD = { title: 'PortfoyGo', text: 'Getirim +%2,00 (sanal para).', url: 'https://portfoygo.com/u/demo' };

describe('shareOrCopy', () => {
  it('Web Share API varsa onu kullanır', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(await shareOrCopy(PAYLOAD, { share, clipboard: { writeText } })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'PortfoyGo', text: PAYLOAD.text, url: PAYLOAD.url });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('kullanıcı vazgeçerse kopyalamaz', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('iptal'), { name: 'AbortError' }));
    const writeText = vi.fn();
    expect(await shareOrCopy(PAYLOAD, { share, clipboard: { writeText } })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('paylaşım yoksa / reddedilirse / canShare false ise panoya kopyalar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrCopy(PAYLOAD, { clipboard: { writeText } })).toBe('copied');
    expect(writeText).toHaveBeenLastCalledWith('Getirim +%2,00 (sanal para). https://portfoygo.com/u/demo');

    const failing: ShareNavigator = { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), clipboard: { writeText } };
    expect(await shareOrCopy(PAYLOAD, failing)).toBe('copied');

    const share = vi.fn();
    expect(await shareOrCopy(PAYLOAD, { share, canShare: () => false, clipboard: { writeText } })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('hiçbiri yoksa ya da pano reddederse failed', async () => {
    expect(await shareOrCopy(PAYLOAD, {})).toBe('failed');
    expect(await shareOrCopy(PAYLOAD, undefined)).toBe('failed');
    expect(await shareOrCopy(PAYLOAD, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('izin yok')) } })).toBe('failed');
  });

  it('pano metni adresi tekrar etmez; etiketler', () => {
    expect(shareClipboardText({ text: 'x https://a.b', url: 'https://a.b' })).toBe('x https://a.b');
    expect(shareClipboardText({ text: '', url: 'https://a.b' })).toBe('https://a.b');
    expect(shareStatusLabel('copied')).toBe('Bağlantı kopyalandı');
    expect(shareStatusLabel(null, 'Sıramı paylaş')).toBe('Sıramı paylaş');
    expect(shareStatusLabel('cancelled')).toBe('Paylaş');
  });
});

describe('sonuç paylaşım metinleri', () => {
  it('Haftalık Seçim ve İmparatorluk: sakin, tutarsız', () => {
    expect(picksShareText({ symbol: 'BTC', direction: 'up', returnPct: 3.456, rank: 2, participants: 40 })).toBe(
      'PortfoyGo Haftalık Seçim’de BTC “yükselir” seçimimle 2. oldum (40 kişi arasında), getirim +%3,46. (Sanal yarışma; yatırım tavsiyesi değildir.)',
    );
    expect(picksShareText({ symbol: 'EUR', direction: 'down', returnPct: -1, rank: null })).toBe(
      'PortfoyGo Haftalık Seçim’de EUR “düşer” seçimimle getirim −%1,00. (Sanal yarışma; yatırım tavsiyesi değildir.)',
    );
    expect(idleShareText(4)).toBe('PortfoyGo Yatırım İmparatorluğu sıralamasında 4. sıradayım. (Sanal bir şehir kurma oyunu.)');
  });
});
