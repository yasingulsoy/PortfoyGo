// PortfoyGo'nun KENDİ çizdiği emtia simgeleri (dış kaynak yok; proje lisansıyla).
//
// Ortak dil: 32×32 viewBox, renkli daire zemin + beyaz glif (kripto ve hisse logolarıyla aynı görsel aile).
// Zemin renkleri beyaz glifle en az ~3:1 kontrast verecek şekilde seçildi; aksan çizgileri zemin rengindedir.

const W = '#fff';
const disc = (bg) => `<circle cx="16" cy="16" r="16" fill="${bg}"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`;

/** Üç külçelik piramit (ons altın / gümüş) */
const barStack = (bg) =>
  svg(
    `${disc(bg)}<g fill="${W}">` +
      '<path d="M5.5 21.5h10l-2-4.6h-6z"/>' +
      '<path d="M16.5 21.5h10l-2-4.6h-6z"/>' +
      '<path d="M11 15.9h10l-2-4.6h-6z"/>' +
      `</g><path fill="none" stroke="${bg}" stroke-width=".8" stroke-linecap="round" opacity=".55" d="M8.6 18.3h3.8M19.6 18.3h3.8M14.1 12.7h3.8"/>`,
  );

/** Tek büyük külçe (platin / paladyum / alüminyum) */
const singleBar = (bg) =>
  svg(
    `${disc(bg)}<path fill="${W}" d="M6.5 21.5h19l-3.4-10H9.9z"/>` +
      `<path fill="none" stroke="${bg}" stroke-width="1" stroke-linecap="round" opacity=".55" d="M11.6 14.2h8.8"/>`,
  );

/** Gram altın: darphane kartı (çerçeve, mühür, yazı satırları) */
const gramGold = (bg) =>
  svg(
    `${disc(bg)}<rect x="10.5" y="6.5" width="11" height="19" rx="2" fill="${W}"/>` +
      `<rect x="12.6" y="8.6" width="6.8" height="8.2" rx="1" fill="none" stroke="${bg}" stroke-width="1.1"/>` +
      `<circle cx="16" cy="12.7" r="1.9" fill="${bg}"/>` +
      `<rect x="13" y="19" width="6" height="1.3" rx=".65" fill="${bg}"/>` +
      `<rect x="14" y="21.6" width="4" height="1.3" rx=".65" fill="${bg}"/>`,
  );

/** Bakır tel bobini */
const coil = (bg) =>
  svg(
    `${disc(bg)}<g fill="none" stroke="${W}" stroke-width="1.6">` +
      [10.6, 13.3, 16, 18.7, 21.4].map((cx) => `<ellipse cx="${cx}" cy="16" rx="2.1" ry="6.4"/>`).join('') +
      '</g>' +
      `<path fill="none" stroke="${W}" stroke-width="1.6" stroke-linecap="round" d="M8.5 16H6.5M23.5 16h2"/>`,
  );

/** Petrol varili (Brent) */
const barrel = (bg) =>
  svg(
    `${disc(bg)}<rect x="10" y="7" width="12" height="18" rx="2.4" fill="${W}"/>` +
      `<rect x="10" y="10.8" width="12" height="1.4" fill="${bg}"/>` +
      `<rect x="10" y="19.8" width="12" height="1.4" fill="${bg}"/>` +
      `<path fill="${bg}" d="M16 13.2c-.2.3-2 2.4-2 3.8a2 2 0 0 0 4 0c0-1.4-1.8-3.5-2-3.8z"/>`,
  );

/** Ham petrol damlası */
const drop = (bg) =>
  svg(
    `${disc(bg)}<path fill="${W}" d="M16 6.3c-.4.5-6.6 8-6.6 12.6a6.6 6.6 0 0 0 13.2 0c0-4.6-6.2-12.1-6.6-12.6z"/>` +
      `<path fill="none" stroke="${bg}" stroke-width="1.3" stroke-linecap="round" d="M12.7 19.3a3.6 3.6 0 0 0 2.5 3"/>`,
  );

/** Doğal gaz alevi */
const flame = (bg) =>
  svg(
    `${disc(bg)}<path fill="${W}" d="M16.6 5.6c.5 3.3 2.5 5.1 4.1 7.1 1.4 1.7 2.1 3.4 2.1 5.4a6.8 6.8 0 0 1-13.6 0c0-2.6 1.1-4.4 2.6-5.9.2 1.7.9 2.8 2 3.3-.3-3.6.9-7 2.8-9.9z"/>` +
      `<path fill="${bg}" d="M16.1 15.6c.4 1.8 2.6 2.7 2.6 5a2.7 2.7 0 0 1-5.4 0c0-1.5.9-2.4 1.6-3.2.2.8.6 1.2 1 1.3-.1-1-.1-2 .2-3.1z"/>`,
  );

/** Isıtma yağı: damla + iç alev */
const heatingOil = (bg) =>
  svg(
    `${disc(bg)}<path fill="${W}" d="M16 6.3c-.4.5-6.6 8-6.6 12.6a6.6 6.6 0 0 0 13.2 0c0-4.6-6.2-12.1-6.6-12.6z"/>` +
      `<path fill="${bg}" d="M16.2 13.8c.3 1.5 2.4 2.6 2.4 5a2.6 2.6 0 0 1-5.2 0c0-1.5.9-2.5 1.5-3.3.2.8.6 1.2 1 1.3-.1-1 0-2 .3-3z"/>`,
  );

/** Benzin pompası */
const fuelPump = (bg) =>
  svg(
    `${disc(bg)}<rect x="8.5" y="7.5" width="10" height="16.5" rx="1.6" fill="${W}"/>` +
      `<rect x="10.5" y="9.6" width="6" height="4.6" rx=".7" fill="${bg}"/>` +
      `<rect x="7.4" y="22.6" width="12.2" height="2.2" rx=".6" fill="${W}"/>` +
      `<path fill="none" stroke="${W}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M18.5 11.2h1.7l2.4 2.4v7.2a1.3 1.3 0 0 1-2.6 0v-3.4h-1.5"/>`,
  );

/** Buğday başağı */
const wheat = (bg) => {
  const grains = [11.6, 15.1, 18.6]
    .flatMap((y) => [
      `<ellipse cx="13.7" cy="${y}" rx="1.6" ry="2.9" transform="rotate(-35 13.7 ${y})"/>`,
      `<ellipse cx="18.3" cy="${y}" rx="1.6" ry="2.9" transform="rotate(35 18.3 ${y})"/>`,
    ])
    .join('');
  return svg(
    `${disc(bg)}<path fill="none" stroke="${W}" stroke-width="1.4" stroke-linecap="round" d="M16 26.5V9.5"/>` +
      `<g fill="${W}">${grains}<ellipse cx="16" cy="8.2" rx="1.5" ry="2.7"/></g>`,
  );
};

/** Mısır koçanı + yapraklar */
const corn = (bg) =>
  svg(
    `${disc(bg)}<ellipse cx="16" cy="14" rx="4.5" ry="8" fill="${W}"/>` +
      `<path fill="none" stroke="${bg}" stroke-width=".8" d="M13 9.5h6M12 12.5h8M11.8 15.5h8.4M12.4 18.5h7.2M16 6.5v15"/>` +
      `<path fill="${W}" d="M16 26.2c-4.1-.8-6.8-4.4-6.8-9.2 1.9 2.7 4.2 4.1 6.8 4.7zM16 26.2c4.1-.8 6.8-4.4 6.8-9.2-1.9 2.7-4.2 4.1-6.8 4.7z"/>` +
      `<path fill="none" stroke="${bg}" stroke-width=".9" d="M16 21.7v4.5"/>`,
  );

/** Pamuk kozası */
const cotton = (bg) =>
  svg(
    `${disc(bg)}<g fill="${W}"><circle cx="12.4" cy="14.2" r="3.7"/><circle cx="19.6" cy="14.2" r="3.7"/>` +
      '<circle cx="16" cy="10.8" r="3.9"/><circle cx="16" cy="16.6" r="3.9"/></g>' +
      `<path fill="none" stroke="${W}" stroke-width="1.4" stroke-linecap="round" d="M16 21v5"/>` +
      `<path fill="${W}" d="M16 23.2c-2.3 0-4.2-1-5.2-2.8 2.1.1 3.9.8 5.2 2.8zM16 23.2c2.3 0 4.2-1 5.2-2.8-2.1.1-3.9.8-5.2 2.8z"/>`,
  );

/** Şeker küpleri (izometrik) */
const sugar = (bg) => {
  const cube = (cx, cy, s) => {
    const h = +(s * 0.866).toFixed(2);
    const p = (pts) => pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' ');
    return (
      `<polygon fill="${W}" points="${p([[cx, cy - s], [cx + h, cy - s / 2], [cx, cy], [cx - h, cy - s / 2]])}"/>` +
      `<polygon fill="${W}" opacity=".78" points="${p([[cx - h, cy - s / 2], [cx, cy], [cx, cy + s], [cx - h, cy + s / 2]])}"/>` +
      `<polygon fill="${W}" opacity=".58" points="${p([[cx, cy], [cx + h, cy - s / 2], [cx + h, cy + s / 2], [cx, cy + s]])}"/>`
    );
  };
  return svg(`${disc(bg)}${cube(12.1, 16.4, 4.6)}${cube(19.9, 16.4, 4.6)}`);
};

/** Soya fasulyesi kabuğu */
const soybean = (bg) =>
  svg(
    `${disc(bg)}<g transform="rotate(-35 16 16)"><rect x="6" y="12.3" width="20" height="7.4" rx="3.7" fill="${W}"/>` +
      `<g fill="${bg}"><circle cx="10.4" cy="16" r="2.1"/><circle cx="16" cy="16" r="2.1"/><circle cx="21.6" cy="16" r="2.1"/></g></g>`,
  );

/** Kahve çekirdeği */
const coffee = (bg) =>
  svg(
    `${disc(bg)}<g transform="rotate(35 16 16)"><ellipse cx="16" cy="16" rx="6.4" ry="9" fill="${W}"/>` +
      `<path fill="none" stroke="${bg}" stroke-width="1.6" stroke-linecap="round" d="M16 7.6c-2.6 3-2.6 5.6 0 8.4s2.6 5.4 0 8.4"/></g>`,
  );

/** Kakao meyvesi */
const cocoa = (bg) =>
  svg(
    `${disc(bg)}<g transform="rotate(-30 16 16)"><ellipse cx="16" cy="16.5" rx="5.6" ry="9.2" fill="${W}"/>` +
      `<path fill="none" stroke="${bg}" stroke-width="1" stroke-linecap="round" d="M16 7.6c-1.9 3-1.9 14.8 0 17.8M16 7.6c1.9 3 1.9 14.8 0 17.8M12.4 9.8c-.9 3.5-.9 9.9 0 13.4M19.6 9.8c.9 3.5.9 9.9 0 13.4"/>` +
      `<path fill="none" stroke="${W}" stroke-width="1.4" stroke-linecap="round" d="M16 7.4V5.6"/></g>`,
  );

/**
 * Kanonik kod → { svg, label, aliases }. Kodlar sağlayıcının (Nosy) emtia kodlarıyla ve uygulamanın
 * diğer kayıtlarıyla (Arena, Global Lab, danışman evreni) uyumludur.
 */
export const COMMODITY_ICONS = {
  GOLD: { label: 'Altın (ons) — külçe yığını', svg: barStack('#CA8A04'), aliases: ['XAU', 'XAUUSD', 'GOLDTRY', 'XAUTRY', 'ALTIN'] },
  GAU: { label: 'Gram altın — darphane kartı', svg: gramGold('#CA8A04'), aliases: ['GRAM_ALTIN', 'GRAMALTIN'] },
  SILVER: { label: 'Gümüş — külçe yığını', svg: barStack('#748397'), aliases: ['SILVER_FUT', 'XAG', 'XAGUSD', 'XAGTRY'] },
  PLATINUM: { label: 'Platin — külçe', svg: singleBar('#56708A'), aliases: ['XPT', 'XPTUSD'] },
  PALLADIUM: { label: 'Paladyum — külçe', svg: singleBar('#4B6B70'), aliases: ['XPD', 'XPDUSD'] },
  ALUMINUM: { label: 'Alüminyum — külçe', svg: singleBar('#5F7FA6'), aliases: ['ALUMINIUM'] },
  COPPER: { label: 'Bakır — tel bobini', svg: coil('#B0582A'), aliases: [] },
  BRENT_OIL: { label: 'Brent petrol — varil', svg: barrel('#475569'), aliases: ['BRENT', 'UKOIL'] },
  CRUDEOIL: { label: 'Ham petrol (WTI) — damla', svg: drop('#475569'), aliases: ['CRUDE_OIL', 'WTI', 'USOIL'] },
  NATURAL_GAS: { label: 'Doğal gaz — alev', svg: flame('#2563EB'), aliases: ['NATURALGAS'] },
  HEATING_OIL: { label: 'Isıtma yağı — damla ve alev', svg: heatingOil('#9A3412'), aliases: [] },
  GASOLINE: { label: 'Benzin — akaryakıt pompası', svg: fuelPump('#B91C1C'), aliases: [] },
  WHEAT: { label: 'Buğday — başak', svg: wheat('#A16207'), aliases: [] },
  CORN: { label: 'Mısır — koçan', svg: corn('#B45309'), aliases: [] },
  COTTON2: { label: 'Pamuk — koza', svg: cotton('#0F766E'), aliases: ['COTTON'] },
  SUGAR: { label: 'Şeker — küp', svg: sugar('#BE185D'), aliases: [] },
  SOYBEAN: { label: 'Soya — fasulye kabuğu', svg: soybean('#4D7C0F'), aliases: ['SOYBEANS'] },
  COFFEE: { label: 'Kahve — çekirdek', svg: coffee('#6F4E37'), aliases: [] },
  COCOA: { label: 'Kakao — meyve', svg: cocoa('#7C2D12'), aliases: [] },
};
