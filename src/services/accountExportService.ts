import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from '@src/api/supabase';

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class NotSignedInError extends Error {
  code = 'not_signed_in' as const;
  constructor() {
    super('not_signed_in');
  }
}

export class AnonymousExportError extends Error {
  code = 'anonymous_export_unavailable' as const;
  constructor() {
    super('anonymous_export_unavailable');
  }
}

/**
 * Fetch the full account-data JSON from the export-account-data edge
 * function, write it to a cache file, and open the native share sheet.
 * Implements GDPR Art. 20 / Korean PIPA §35 (data portability + access).
 */
export async function exportAccountDataJson(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new NotSignedInError();
  if (session.user.is_anonymous) throw new AnonymousExportError();

  const { data, error } = await supabase.functions.invoke('export-account-data', {
    body: {},
  });
  if (error) {
    // Inspect the structured error body for the anonymous case.
    try {
      const ctx = (error as { context?: { response?: Response } }).context;
      if (ctx?.response) {
        const body = await ctx.response.clone().json();
        if (body?.error === 'anonymous_export_unavailable') {
          throw new AnonymousExportError();
        }
      }
    } catch (e) {
      if (e instanceof AnonymousExportError) throw e;
    }
    throw new Error((error as Error).message || 'export_failed');
  }

  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const fileName = `moavoca-account-export_${todayStamp()}.json`;

  const file = new File(Paths.cache, fileName);
  try {
    file.delete();
  } catch {
    // file did not exist — fine
  }
  file.create();
  file.write(json);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing not available on this device');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'MoaVoca Account Export',
    UTI: 'public.json',
  });
}
