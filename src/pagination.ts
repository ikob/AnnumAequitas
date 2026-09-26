import { translate, type Locale } from './i18n.ts';

export const PAGE_SIZE = 50;
export function pageWindow<T>(rows: T[], requested = 1) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.trunc(requested) || 1));
  const start = (page - 1) * PAGE_SIZE;
  return { page, pages, total: rows.length, start, rows: rows.slice(start, start + PAGE_SIZE) };
}
export function pagination(info: ReturnType<typeof pageWindow>, group: 'stocks' | 'crypto', locale: Locale) {
  if (info.pages === 1) return '';
  const tr = (key: 'pagePrevious' | 'pageNext') => translate(locale, key);
  return `<nav class="pagination" aria-label="${translate(locale, group === 'stocks' ? 'stockPages' : 'cryptoPages')}"><span>${translate(locale, 'pageRange', { start: info.start + 1, end: Math.min(info.start + PAGE_SIZE, info.total), total: info.total, page: info.page, pages: info.pages })}</span><button class="button secondary" data-page-group="${group}" data-page="${info.page - 1}" ${info.page === 1 ? 'disabled' : ''}>${tr('pagePrevious')}</button><button class="button secondary" data-page-group="${group}" data-page="${info.page + 1}" ${info.page === info.pages ? 'disabled' : ''}>${tr('pageNext')}</button></nav>`;
}
