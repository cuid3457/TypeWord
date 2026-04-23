import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { captureError } from '@src/services/sentry';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  retryCount: number;
}

/** Class-based error boundary — wraps screens to catch render crashes. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
    captureError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          canRetry={this.state.retryCount < 3}
          onRetry={() => this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }))}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorFallback({ canRetry, onRetry }: { canRetry: boolean; onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-10 dark:bg-black">
      <MaterialIcons name="error-outline" size={48} color="#9ca3af" />
      <Text className="mt-4 text-xl font-bold text-black dark:text-white">
        {t('error.title')}
      </Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        {canRetry ? t('error.message') : t('error.init_failed')}
      </Text>
      {canRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-8 items-center rounded-xl bg-black px-8 py-4 dark:bg-white"
        >
          <Text className="text-base font-semibold text-white dark:text-black">
            {t('error.retry')}
          </Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
