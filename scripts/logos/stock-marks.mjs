// PortfoyGo'nun KENDİ çizdiği hisse işaretleri — simple-icons'ta bulunmayan ama listede çok görünen şirketler için.
// Dış kaynak yok; basit geometrik çizimler. Hisse rozetleriyle aynı 32×32 daire biçimi.
//
// ⚠️ Ticari marka: işaretler yalnızca varlığı tanımlamak içindir (ATTRIBUTION.md'deki marka notu kapsar).
//  - MSFT: dört renkli kare ızgarası Microsoft'un logosunun kendisine çok yakındır (Microsoft, simge setlerinden
//    logolarının kaldırılmasını istemiştir). Hukuk incelemesi sonucu gerekirse bu girdiyi silip betiği yeniden
//    çalıştırmak yeterlidir (hisse baş harf gösterir).
//  - AMZN: genel bir küçük harf "a" monogramıdır; Amazon'un gülümseme / ok logosu DEĞİLDİR.

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

export const OWN_STOCK_MARKS = {
  MSFT: {
    label: 'Microsoft — açık daire üzerinde dört renkli kare ızgarası',
    note: "Microsoft'un dört renkli kare logosuna dayanır (simple-icons'tan Microsoft'un talebiyle kaldırıldı); hukuk incelemesinde ayrıca bakılmalı.",
    svg: svg(
      '<circle cx="16" cy="16" r="16" fill="#F5F5F5"/>' +
        '<rect x="8.4" y="8.4" width="7.2" height="7.2" fill="#F25022"/>' +
        '<rect x="16.4" y="8.4" width="7.2" height="7.2" fill="#7FBA00"/>' +
        '<rect x="8.4" y="16.4" width="7.2" height="7.2" fill="#00A4EF"/>' +
        '<rect x="16.4" y="16.4" width="7.2" height="7.2" fill="#FFB900"/>',
    ),
  },
  AMZN: {
    label: 'Amazon — koyu daire üzerinde turuncu küçük harf "a" monogramı',
    note: 'PortfoyGo monogramı; Amazon logosunun (gülümseme oku) kopyası değildir, yalnızca marka turuncusu kullanılır.',
    svg: svg(
      '<circle cx="16" cy="16" r="16" fill="#232F3E"/>' +
        '<circle cx="15.3" cy="16" r="5" fill="none" stroke="#FF9900" stroke-width="2.8"/>' +
        '<rect x="20.3" y="9.6" width="2.8" height="12.8" rx="1.4" fill="#FF9900"/>',
    ),
  },
};
