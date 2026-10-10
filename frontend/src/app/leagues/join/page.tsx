'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSWRConfig } from 'swr';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { cn } from '@portfoygo/shared/format';
import Breadcrumb from '@/components/common/Breadcrumb';
import { toolbarButtonClass } from '@/components/common/controls';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { JoinForm } from '@/components/leagues/JoinLeague';
import { LEAGUES_KEY } from '@/components/leagues/shared';

export default function JoinLeaguePage() {
  // useSearchParams askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <JoinLeague />
    </Suspense>
  );
}

function JoinLeague() {
  const { user, ready } = useRequireAuth();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  if (!ready || !user) return <PageLoader />;
  const code = search.get('code') ?? '';

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Lige katıl"
        description="Bir arkadaşın seni ligine davet etti. Lig bilgilerini kontrol et ve katıl."
        actions={
          <>
            <Link href="/leagues" className={cn(toolbarButtonClass, 'md:hidden')}>
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              Liglerim
            </Link>
            <Breadcrumb
              items={[
                { label: 'Panel', href: '/' },
                { label: 'Ligler', href: '/leagues' },
                { label: 'Lige katıl' },
              ]}
            />
          </>
        }
      />
      <Card className="mx-auto max-w-xl">
        <CardHeader title="Davet" description="Adil başlangıç: herkes eşit şartlarda" />
        <CardBody className="border-t border-line">
          <JoinForm
            key={code}
            initialCode={code}
            verified={user.email_verified}
            autoFocus={!code}
            onJoined={(league) => {
              toast.success('Lige katıldın', { description: league.name });
              void mutate(LEAGUES_KEY);
              router.replace(`/leagues/${league.id}`);
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
