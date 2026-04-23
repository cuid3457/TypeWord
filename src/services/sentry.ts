import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
    release: Constants.expoConfig?.version ?? '1.0.0',
    tracesSampleRate: 0.2,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) {
    console.error('[Sentry]', error, context);
    return;
  }
  if (!DSN) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function setUser(userId: string | null) {
  if (!DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  if (!DSN || __DEV__) return;
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}
