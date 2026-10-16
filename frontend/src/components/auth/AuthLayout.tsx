import type { ReactNode } from 'react';
import Link from 'next/link';
import AuthSplitLayout from '@portfoygo/shared/ui/AuthSplitLayout';

interface AuthLayoutProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Formun altındaki yardımcı satır (ör. "Hesabın yok mu? Kayıt ol") */
  footer?: ReactNode;
}

/** Giriş, kayıt, doğrulama ve şifre sıfırlama sayfalarının ortak TailAdmin düzeni. */
export default function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <AuthSplitLayout
      title={title}
      description={description}
      footer={footer}
      legal={
        <>
          <Link href="/terms" className="hover:text-fg">Kullanım şartları</Link>
          <Link href="/privacy" className="hover:text-fg">Gizlilik politikası</Link>
          <Link href="/cerez-politikasi" className="hover:text-fg">Çerezler</Link>
          <span>© {new Date().getFullYear()} PortfoyGo</span>
        </>
      }
    >
      {children}
    </AuthSplitLayout>
  );
}
