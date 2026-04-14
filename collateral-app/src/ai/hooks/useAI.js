import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export function useAIStatus() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let live = true;
    api.aiStatus()
      .then(s => { if (live) setEnabled(!!s?.enabled); })
      .catch(() => { if (live) setEnabled(false); });
    return () => { live = false; };
  }, []);
  return enabled;
}

// Generic AI call hook — wraps any api.ai* method with loading / error state
// and returns a stable `run` callback.
export function useAICall(fn) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [meta, setMeta]       = useState(null);
  const abortRef = useRef(0);

  const run = useCallback(async (...args) => {
    const token = ++abortRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      if (token !== abortRef.current) return;
      setText(result?.text || '');
      setMeta({ toolsUsed: result?.toolsUsed || [], usage: result?.usage, structured: result?.structured ?? null });
    } catch (err) {
      if (token !== abortRef.current) return;
      setError(err.message || 'AI request failed');
      setText('');
    } finally {
      if (token === abortRef.current) setLoading(false);
    }
  }, [fn]);

  const reset = useCallback(() => {
    abortRef.current += 1;
    setText(''); setError(null); setMeta(null); setLoading(false);
  }, []);

  return { text, meta, loading, error, run, reset };
}
