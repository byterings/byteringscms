'use client';

import type { EntityDefinition, PageMeta, RecordItem } from '@bytecontent/contracts';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { useEntities } from '@/lib/queries';
import type { InputField } from './field-input';
import { Input } from './ui';

function idsOf(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function recordTitle(entity: EntityDefinition | undefined, record: RecordItem): string {
  const key = entity?.titleField;
  const value = key ? record.data[key] : null;
  return value === null || value === undefined || value === ''
    ? record.id.slice(0, 8)
    : String(value);
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Searchable picker over the records of a relation field's target entity. */
export function RelationPicker({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string;
  field: InputField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const many = field.config.cardinality === 'many';
  const entities = useEntities();
  const target = entities.data?.find((e) => e.id === field.config.targetEntityId);
  const selected = idsOf(value);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const term = useDebounced(search);

  const labels = useQuery({
    queryKey: ['records', target?.key, 'labels', selected],
    enabled: !!target && selected.length > 0,
    queryFn: async () =>
      (
        await api.request<{ data: RecordItem[] }>(`/entities/${target!.key}/records`, {
          query: { 'filter[id][in]': selected.join(','), pageSize: 100 },
        })
      ).data,
  });
  const options = useQuery({
    queryKey: ['records', target?.key, 'options', term],
    enabled: !!target && open,
    queryFn: () =>
      api.request<{ data: RecordItem[]; meta: PageMeta }>(`/entities/${target!.key}/records`, {
        query: { search: term || undefined, pageSize: 10 },
      }),
  });

  if (!target) {
    return (
      <p className="text-sm text-slate-500">
        {entities.isLoading ? 'Loading…' : 'Target entity unavailable'}
      </p>
    );
  }

  const titleOf = (recordId: string) => {
    const record = labels.data?.find((r) => r.id === recordId);
    return record ? recordTitle(target, record) : recordId.slice(0, 8);
  };

  const choose = (recordId: string) => {
    if (many) {
      if (!selected.includes(recordId)) onChange([...selected, recordId]);
    } else {
      onChange(recordId);
      setOpen(false);
    }
    setSearch('');
  };

  const remove = (recordId: string) => {
    const next = selected.filter((x) => x !== recordId);
    onChange(many ? (next.length ? next : null) : null);
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${field.label}`}>
          {selected.map((recordId) => (
            <li
              key={recordId}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-sm text-brand-700"
            >
              {titleOf(recordId)}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${titleOf(recordId)}`}
                  onClick={() => remove(recordId)}
                  className="rounded-full hover:bg-brand-100"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled && (many || selected.length === 0 || open) ? (
        <div className="relative">
          <Input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            autoComplete="off"
            placeholder={`Search ${target.pluralName.toLowerCase()}…`}
            value={search}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
          />
          {open ? (
            <ul
              id={`${id}-listbox`}
              role="listbox"
              className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              {options.isLoading ? (
                <li className="px-3 py-2 text-sm text-slate-500">Loading…</li>
              ) : null}
              {options.data?.data.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
              ) : null}
              {options.data?.data.map((record) => (
                <li
                  key={record.id}
                  role="option"
                  aria-selected={selected.includes(record.id)}
                  className="cursor-pointer px-3 py-1.5 text-sm hover:bg-slate-100 aria-selected:font-medium"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(record.id);
                  }}
                >
                  {recordTitle(target, record)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : !disabled ? (
        <button
          type="button"
          className="text-sm text-brand-600 hover:underline"
          onClick={() => setOpen(true)}
        >
          Change
        </button>
      ) : null}
    </div>
  );
}
