'use client';

import { use } from 'react';
import UserDetail from '@/components/UserDetail';

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Aynı sayfada başka kullanıcıya geçilirse durum (sekme, pencere) sıfırlansın
  return <UserDetail key={id} userId={id} />;
}
