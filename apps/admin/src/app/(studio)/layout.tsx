'use client';

import clsx from 'clsx';
import {
  Database,
  FileText,
  Home,
  Image as ImageIcon,
  KeyRound,
  LayoutTemplate,
  LogOut,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LogoMark } from '@/components/logo';
import { Loading, Select } from '@/components/ui';
import { useEntities } from '@/lib/queries';
import { useSession } from '@/lib/session';

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Home;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
        active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-100',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function StudioLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, loading, logout, switchTenant, can } = useSession();
  const hasTenant = !!session?.activeTenant;
  const entities = useEntities(hasTenant && can('metadata:read'));

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return <Loading fullScreen />;
  }

  const contentEntities = (entities.data ?? []).filter((e) => e.status === 'active');

  return (
    <div className="flex min-h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="mb-4 flex items-center gap-2 px-2.5">
          <LogoMark size={28} />
          <span className="text-sm font-semibold">
            Byte<span className="text-brand-600">Content</span>
          </span>
        </div>

        {session.memberships.length > 1 && session.tenancyMode === 'multi' ? (
          <div className="px-1">
            <label htmlFor="tenant-switcher" className="sr-only">
              Tenant
            </label>
            <Select
              id="tenant-switcher"
              value={session.activeTenant?.id ?? ''}
              onChange={async (event) => {
                await switchTenant(event.target.value);
                router.push('/dashboard');
              }}
            >
              {session.memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantName}
                </option>
              ))}
            </Select>
          </div>
        ) : session.activeTenant ? (
          <p
            className="truncate px-2.5 text-sm font-medium text-slate-900"
            data-testid="tenant-name"
          >
            {session.activeTenant.name}
          </p>
        ) : null}

        <nav className="flex-1 overflow-y-auto" aria-label="Main">
          <div className="mt-4 space-y-0.5">
            <NavLink href="/dashboard" icon={Home}>
              Dashboard
            </NavLink>
          </div>
          {hasTenant ? (
            <>
              <NavSection title="Content">
                {contentEntities.map((entity) => (
                  <NavLink key={entity.id} href={`/content/${entity.key}`} icon={FileText}>
                    {entity.pluralName}
                  </NavLink>
                ))}
                {can('media:read') ? (
                  <NavLink href="/media" icon={ImageIcon}>
                    Media
                  </NavLink>
                ) : null}
              </NavSection>
              <NavSection title="Build">
                {can('metadata:read') ? (
                  <NavLink href="/schema" icon={Database}>
                    Schema
                  </NavLink>
                ) : null}
                {can('templates:manage') ? (
                  <NavLink href="/templates" icon={LayoutTemplate}>
                    Templates &amp; plugins
                  </NavLink>
                ) : null}
                {can('apikeys:manage') ? (
                  <NavLink href="/settings/api-keys" icon={KeyRound}>
                    API keys
                  </NavLink>
                ) : null}
              </NavSection>
              <NavSection title="Settings">
                {can('members:manage') ? (
                  <NavLink href="/settings/members" icon={Users}>
                    Members
                  </NavLink>
                ) : null}
                {can('audit:read') ? (
                  <NavLink href="/settings/audit" icon={ScrollText}>
                    Audit log
                  </NavLink>
                ) : null}
                <NavLink href="/settings/account" icon={Settings}>
                  Account
                </NavLink>
              </NavSection>
            </>
          ) : null}
        </nav>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="truncate px-2.5 text-sm font-medium text-slate-900">{session.user.name}</p>
          <p className="truncate px-2.5 text-xs text-slate-500">{session.user.email}</p>
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
