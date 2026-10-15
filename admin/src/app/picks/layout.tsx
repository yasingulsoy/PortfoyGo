import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Haftalık Seçim',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
