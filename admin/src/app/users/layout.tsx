import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kullanıcılar',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
