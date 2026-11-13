'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { setupRequestSchema, type Session } from '@byteringscms/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { Alert, Button, FormField, Input, Loading } from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys, useSetupStatus } from '@/lib/queries';
import { useSession } from '@/lib/session';

type FormValues = z.input<typeof setupRequestSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export default function SetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSetupStatus();
  const { setSession } = useSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(setupRequestSchema),
    defaultValues: { tenantName: '', tenantSlug: '', name: '', email: '', password: '' },
  });

  useEffect(() => {
    if (status.data?.initialized) router.replace('/login');
  }, [status.data, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.request<{ data: Session }>('/setup', {
        method: 'POST',
        body: setupRequestSchema.parse(values),
      });
      setSession(res.data);
      queryClient.setQueryData(keys.setup, { initialized: true });
      router.replace('/dashboard');
    } catch (e) {
      const fields = fieldErrors(e);
      for (const [name, message] of Object.entries(fields)) {
        form.setError(name as keyof FormValues, { message });
      }
      setError(errorMessage(e));
    }
  });

  if (status.isLoading) return <Loading />;
  const { errors, isSubmitting } = form.formState;
  const tenantName = form.register('tenantName');

  return (
    <AuthCard
      title="Set up your installation"
      subtitle="Create your organization and owner account."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert>{error}</Alert> : null}
        <FormField
          label="Organization name"
          htmlFor="tenantName"
          required
          error={errors.tenantName?.message}
        >
          <Input
            id="tenantName"
            {...tenantName}
            onChange={(event) => {
              void tenantName.onChange(event);
              if (!form.getFieldState('tenantSlug').isDirty) {
                form.setValue('tenantSlug', slugify(event.target.value));
              }
            }}
          />
        </FormField>
        <FormField
          label="Organization slug"
          htmlFor="tenantSlug"
          required
          hint="Lower-case identifier used in URLs."
          error={errors.tenantSlug?.message}
        >
          <Input id="tenantSlug" {...form.register('tenantSlug')} />
        </FormField>
        <FormField label="Your name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" autoComplete="name" {...form.register('name')} />
        </FormField>
        <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          required
          hint="At least 12 characters."
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create installation
        </Button>
      </form>
    </AuthCard>
  );
}
