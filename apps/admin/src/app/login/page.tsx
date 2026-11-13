'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@byteringscms/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { Alert, Button, FormField, Input } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';

const formSchema = loginRequestSchema;
type FormValues = z.input<typeof formSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { session, login } = useSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (session) router.replace('/dashboard');
  }, [session, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(formSchema.parse(values));
      router.replace('/dashboard');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const { errors, isSubmitting } = form.formState;
  return (
    <AuthCard title="Sign in to Admin Studio">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert>{error}</Alert> : null}
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
