import { useEffect, useState } from 'react';

// Minimal hash router: #/  #/incidents  #/incidents/new  #/incidents/12
// Hash URLs work on any static host (S3/CloudFront) without rewrite rules.

const currentPath = () => window.location.hash.replace(/^#/, '') || '/';

export function navigate(path) {
  window.location.hash = path;
}

export function useHashPath() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

/** Match '/incidents/:id' style patterns. Returns params object or null. */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
