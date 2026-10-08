import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Giriş yap',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
