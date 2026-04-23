import { useEffect, useState } from 'react';
import { isPremium, subscribePremium } from '@src/services/subscriptionService';

export function usePremium(): boolean {
  const [premium, setPremium] = useState(isPremium);

  useEffect(() => {
    setPremium(isPremium());
    return subscribePremium(setPremium);
  }, []);

  return premium;
}
