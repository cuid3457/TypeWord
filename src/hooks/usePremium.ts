import { useEffect, useState } from 'react';
import {
  getTier,
  isPremium,
  subscribePremium,
  subscribeTier,
  type Tier,
} from '@src/services/subscriptionService';

/**
 * Returns the user's current tier ('free' | 'pro').
 * Re-renders when the tier changes (purchase, referral bonus, log out, etc.).
 */
export function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(getTier);

  useEffect(() => {
    setTier(getTier());
    return subscribeTier(setTier);
  }, []);

  return tier;
}

/**
 * Returns true for paid tier (pro).
 */
export function usePremium(): boolean {
  const [premium, setPremium] = useState(isPremium);

  useEffect(() => {
    setPremium(isPremium());
    return subscribePremium(setPremium);
  }, []);

  return premium;
}
