'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

export default function ConditionalFooter() {
  const pathname = usePathname();

  const hideFooterPages = ['/login', '/register', '/verify-email'];

  if (hideFooterPages.includes(pathname)) {
    return null;
  }

  return <Footer />;
}
