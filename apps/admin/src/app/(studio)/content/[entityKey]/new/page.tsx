'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RecordForm } from '@/components/record-form';
import { Alert, Loading, PageHeader } from '@/components/ui';
import { useEntityByKey } from '@/lib/queries';

export default function NewRecordPage() {
  const { entityKey } = useParams<{ entityKey: string }>();
  const router = useRouter();
  const entity = useEntityByKey(entityKey);
  if (entity.isLoading) return <Loading />;
  if (!entity.data) return <Alert>Entity not found.</Alert>;
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href={`/content/${entityKey}`} className="text-brand-600 hover:underline">
          {entity.data.pluralName}
        </Link>{' '}
        / New
      </p>
      <PageHeader title={`New ${entity.data.name.toLowerCase()}`} />
      <RecordForm
        entity={entity.data}
        onSaved={(record) => router.replace(`/content/${entityKey}/${record.id}`)}
      />
    </div>
  );
}
