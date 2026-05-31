import { useEffect, useRef, useState } from 'react';

import { AppModal } from '@/components/app-modal';
import {
  _registerAppConfirmHandler,
  type AppConfirmRequest,
} from '@src/services/appModalHost';

export function AppModalHost() {
  const [req, setReq] = useState<AppConfirmRequest | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    _registerAppConfirmHandler((r) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setReq(r);
      }),
    );
    return () => _registerAppConfirmHandler(null);
  }, []);

  const close = (ok: boolean) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    setReq(null);
    r?.(ok);
  };

  if (!req) return null;
  return (
    <AppModal
      visible
      title={req.title}
      message={req.message}
      buttonText={req.cancelText}
      confirmText={req.confirmText}
      destructive={req.destructive}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
    />
  );
}
