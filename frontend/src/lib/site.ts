/** Sitenin herkese açık kök adresi (sitemap, robots ve OG için). Sonda "/" olmadan. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Ayrı çalışan yönetim paneli uygulamasının adresi (admin/). */
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(/\/+$/, '');

export const SITE_NAME = 'PortfoyGo';
export const SITE_TAGLINE = 'Gerçek piyasa. Sanal para. Gerçek rekabet.';
