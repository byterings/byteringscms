'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';
import { useSetupStatus } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** Routes to setup, login or the studio depending on installation and session state. */
export default function HomePage() {
  const router = useRouter();
  const setup = useSetupStatus();
  const { session, loading } = useSession();

  useEffect(() => {
    if (setup.isLoading || loading) return;
    if (setup.data && !setup.data.initialized) router.replace('/setup');
    else if (session) router.replace('/dashboard');
    else router.replace('/login');
  }, [setup.isLoading, setup.data, loading, session, router]);

  return (
    <main>
      <Loading fullScreen />
    </main>
  );
}
