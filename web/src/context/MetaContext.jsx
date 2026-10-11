import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORY_ICONS } from '../lib/constants.js';

/**
 * Reference data (trades + sites) is tiny and used on almost every screen,
 * so we load it once per session and share it.
 */
const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [status, setStatus] = useState('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [categoryResponse, locationResponse] = await Promise.all([api.meta.categories(), api.meta.locations()]);
      setCategories(categoryResponse ?? []);
      setLocations(locationResponse ?? []);
    } catch {
      setCategories([]);
      setLocations([]);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    const byKey = new Map(categories.map((category) => [category.key, category]));
    return {
      status,
      categories,
      locations,
      reload: load,
      category: (key) => byKey.get(key) ?? { key, name: key, icon: CATEGORY_ICONS[key] ?? '🔧' },
      categoryIcon: (key) => byKey.get(key)?.icon ?? CATEGORY_ICONS[key] ?? '🔧',
      categoryName: (key) => byKey.get(key)?.name ?? key,
      zones: [...new Set(locations.map((location) => location.zone).filter(Boolean))].sort(),
    };
  }, [categories, locations, status, load]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const context = useContext(MetaContext);
  if (!context) throw new Error('useMeta must be used inside <MetaProvider>');
  return context;
}
