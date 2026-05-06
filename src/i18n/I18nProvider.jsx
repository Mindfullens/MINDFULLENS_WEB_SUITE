import { createContext, useContext, useMemo } from 'react';
import en from './locales/en.json';
import pl from './locales/pl.json';

/** Katalog komunikatów — `en` musi mieć te same klucze co `pl` (skrypt parity). */
const CATALOG = { pl, en };

const I18nContext = createContext(null);

function getByPath(obj, path) {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function applyVars(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export function I18nProvider({ children, locale = 'pl' }) {
  const value = useMemo(() => {
    const messages = CATALOG[locale] ?? CATALOG.pl;
    function t(key, vars) {
      const raw = getByPath(messages, key);
      if (typeof raw !== 'string') {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] Brak klucza: "${key}" (locale=${locale})`);
        }
        return key;
      }
      return applyVars(raw, vars);
    }
    return { locale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n musi być użyty wewnątrz <I18nProvider>');
  }
  return ctx;
}
