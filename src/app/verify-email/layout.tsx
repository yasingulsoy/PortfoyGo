import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E-posta doğrulama',
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
