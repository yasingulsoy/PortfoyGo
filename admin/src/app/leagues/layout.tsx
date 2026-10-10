import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ligler',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
