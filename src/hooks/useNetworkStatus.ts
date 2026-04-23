import { useEffect, useState } from 'react';

let NetInfo: typeof import('@react-native-community/netinfo').default | null = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  // Native module unavailable (e.g. Expo Go) — gracefully degrade.
}

/** Returns `true` when the device has an active internet connection. */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    if (!NetInfo) return;

    NetInfo.fetch().then((state) => {
      const connected = (state.isConnected && state.isInternetReachable) ?? false;
      setIsConnected(connected);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable ?? true;
      setIsConnected((state.isConnected ?? false) && reachable);
    });
    return unsubscribe;
  }, []);

  return isConnected;
}
