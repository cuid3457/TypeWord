import { useEffect, useState } from 'react';

import { supabase } from '@src/api/supabase';

/**
 * Reactive isAnonymous flag. Defaults to true so the first render assumes
 * an anonymous session (matches the boot-time signInAnonymously call in
 * _layout.tsx). Re-renders when auth state changes (SIGNED_IN / SIGNED_OUT
 * / TOKEN_REFRESHED).
 *
 * Used by anon-only UI: home active-empty state, wordlist/word save limits,
 * and the signup CTAs gated on commitment moments.
 */
export function useIsAnonymous(): boolean {
  const [isAnon, setIsAnon] = useState(true);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsAnon(data.session?.user?.is_anonymous ?? true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAnon(session?.user?.is_anonymous ?? true);
      },
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
  return isAnon;
}
