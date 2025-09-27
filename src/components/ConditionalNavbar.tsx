'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname();
  
  // Bu sayfalarda navbar gözükmesin
  const hideNavbarPages = ['/login', '/register', '/verify-email'];
  
  if (hideNavbarPages.includes(pathname)) {
    return null;
  }
  
  return <Navbar />;
}
