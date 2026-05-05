import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Allow-list of context keys that may be transmitted as Sentry "extra".
// Anything else is stripped — protects against accidental PII / token leaks
// when a developer adds context.
const ALLOWED_EXTRA_KEYS = new Set([
  'screen', 'route', 'action', 'reviewMode', 'lookupMode', 'language',
  'sourceLang', 'targetLang', 'bookId', 'wordId', 'confidence', 'note',
  'cacheHit', 'durationMs', 'status', 'errorCode',
]);

// Patterns that look like leaked secrets/PII. Replaced before transmission.
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/g, replacement: 'Bearer ***' },
  { pattern: /sk-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-***' },
  { pattern: /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/g, replacement: 'jwt-***' },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '***@***' },
];

function scrubString(s: string): string {
  let out = s;
  for (const { pattern, replacement } of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (typeof event.message === 'string') event.message = scrubString(event.message);
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (typeof v.value === 'string') v.value = scrubString(v.value);
    }
  }
  if (event.extra) {
    for (const k of Object.keys(event.extra)) {
      if (!ALLOWED_EXTRA_KEYS.has(k)) delete event.extra[k];
    }
  }
  return event;
}

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
    release: Constants.expoConfig?.version ?? '1.0.0',
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeBreadcrumb(crumb) {
      if (typeof crumb.message === 'string') crumb.message = scrubString(crumb.message);
      return crumb;
    },
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
        if (ALLOWED_EXTRA_KEYS.has(k)) scope.setExtra(k, v);
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
