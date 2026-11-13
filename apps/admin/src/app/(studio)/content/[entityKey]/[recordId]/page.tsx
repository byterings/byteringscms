'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { RecordForm } from '@/components/record-form';
import { Alert, Loading, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useEntityByKey, useRecord } from '@/lib/queries';

export default function EditRecordPage() {
  const { entityKey, recordId } = useParams<{ entityKey: string; recordId: string }>();
  const entity = useEntityByKey(entityKey);
  const record = useRecord(entityKey, recordId);
  const [saved, setSaved] = useState(false);

  if (entity.isLoading || record.isLoading) return <Loading />;
  if (!entity.data) return <Alert>Entity not found.</Alert>;
  if (record.isError || !record.data) return <Alert>{errorMessage(record.error)}</Alert>;

  const title = entity.data.titleField ? record.data.data[entity.data.titleField] : null;
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href={`/content/${entityKey}`} className="text-brand-600 hover:underline">
          {entity.data.pluralName}
        </Link>{' '}
        / {title ? String(title) : record.data.id}
      </p>
      <PageHeader
        title={title ? String(title) : `${entity.data.name} record`}
        description={
          <span className="font-mono text-xs">
            {record.data.id} · version {record.data.version} · updated{' '}
            {new Date(record.data.updatedAt).toLocaleString()}
          </span>
        }
      />
      {saved ? (
        <div className="mb-4">
          <Alert tone="success">Saved.</Alert>
        </div>
      ) : null}
      <RecordForm
        key={`${record.data.id}-${record.data.version}`}
        entity={entity.data}
        record={record.data}
        onSaved={() => setSaved(true)}
      />
    </div>
  );
}
