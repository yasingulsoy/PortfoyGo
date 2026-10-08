/** Sitenin herkese açık kök adresi (sitemap, robots ve OG için). Sonda "/" olmadan. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const SITE_NAME = 'PortfoyGo';
export const SITE_TAGLINE = 'Gerçek piyasa. Sanal para. Gerçek rekabet.';
