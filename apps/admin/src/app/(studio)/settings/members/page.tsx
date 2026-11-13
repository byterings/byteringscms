'use client';

import { ROLES, type Member, type Role } from '@byteringscms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  FormField,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys } from '@/lib/queries';
import { useSession } from '@/lib/session';

function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () =>
      api.request('/admin/members', {
        method: 'POST',
        body: { email, role, name: name || undefined, password: password || undefined },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members });
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  return (
    <Dialog open onClose={onClose} title="Add member">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          mutation.mutate();
        }}
      >
        {mutation.isError ? <Alert>{errorMessage(mutation.error)}</Alert> : null}
        <FormField label="Email" htmlFor="m-email" required error={errors.email}>
          <Input
            id="m-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label="Role" htmlFor="m-role">
          <Select id="m-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </FormField>
        <p className="text-xs text-slate-500">
          For a new user, also set a name and an initial password (min. 12 characters).
        </p>
        <FormField label="Name" htmlFor="m-name" error={errors.name}>
          <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="Initial password" htmlFor="m-password" error={errors.password}>
          <Input
            id="m-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Add member
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function MembersPage() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = useQuery({
    queryKey: keys.members,
    queryFn: async () => (await api.request<{ data: Member[] }>('/admin/members')).data,
  });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api.request(`/admin/members/${id}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members }),
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.request(`/admin/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.members }),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Members"
        description="People with access to this workspace."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add member
          </Button>
        }
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {members.isLoading ? (
        <Loading />
      ) : members.isError ? (
        <Alert>{errorMessage(members.error)}</Alert>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.data!.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.name}</Td>
                <Td>{m.email}</Td>
                <Td>
                  <Select
                    aria-label={`Role of ${m.email}`}
                    className="w-32 py-1"
                    value={m.role}
                    disabled={m.userId === session?.user.id}
                    onChange={(e) => {
                      setError(null);
                      update.mutate({ id: m.id, role: e.target.value as Role });
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="text-right">
                  {m.userId !== session?.user.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${m.email}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${m.email} from this workspace?`)) {
                          setError(null);
                          remove.mutate(m.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {adding ? <AddMemberDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}
