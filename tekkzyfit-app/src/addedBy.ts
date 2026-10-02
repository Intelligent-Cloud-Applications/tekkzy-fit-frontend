import type { Member } from './types';

/** Every id a staff member's `addedById` might hold, comma-joined for the `addedBy` API filter. */
export function staffIdKey(row: Member) {
  return [...new Set([row.loginSub, row.id, row.cognitoId].filter(Boolean) as string[])].join(',');
}

export function addedByOptions(staff: Member[]) {
  return [
    { value: '', label: 'Added by all' },
    { value: 'none', label: 'By owner' },
    ...staff
      .filter((row) => row.name && staffIdKey(row))
      .map((row) => ({ value: staffIdKey(row), label: `By ${row.name}` })),
  ];
}
