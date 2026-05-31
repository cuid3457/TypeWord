/**
 * Imperative confirm dialog API used by non-React layers (services / handlers)
 * that need user confirmation. Bridges to AppModal so callers get app-styled
 * UI instead of the OS Alert.alert default — same visual language as the rest
 * of the modals.
 *
 * Wire-up: app/_layout.tsx mounts <AppModalHost />, which registers itself
 * here on mount. Callers call showAppConfirm(...) and await the boolean.
 */

export interface AppConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
}

type Handler = (req: AppConfirmRequest) => Promise<boolean>;

let handler: Handler | null = null;

export function _registerAppConfirmHandler(h: Handler | null) {
  handler = h;
}

export function showAppConfirm(req: AppConfirmRequest): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  return handler(req);
}
