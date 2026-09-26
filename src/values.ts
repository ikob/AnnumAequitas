export class LedgerError extends Error {
  readonly code: string;
  readonly row?: number;
  constructor(code: string, row?: number) { super(code); this.code = code; this.row = row; }
}

export function dateValue(value: string): string | null {
  const v = value.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const iso = m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
export function numberValue(value: string): string | null {
  let v = value.trim();
  if (v === '' || v === '--') return null;
  if (/^\(.+\)$/.test(v)) v = `-${v.slice(1, -1)}`;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(v)) throw new LedgerError('number');
  return v.replaceAll(',', '');
}
