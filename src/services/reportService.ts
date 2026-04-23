import { supabase } from '@src/api/supabase';
import { getDb } from '@src/db';

interface ReportParams {
  word: string;
  wordId?: string;
  reason: 'wrong_meaning' | 'wrong_example' | 'other';
  description?: string;
  context: 'search' | 'detail' | 'review';
}

export async function submitReport(params: ReportParams): Promise<boolean> {
  const id = `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pending_reports (id, word, word_id, reason, description, context, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, params.word, params.wordId ?? null, params.reason, params.description || null, params.context, now],
  );

  await flushPendingReports();
  return true;
}

export async function flushPendingReports(): Promise<void> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: string;
      word: string;
      word_id: string | null;
      reason: string;
      description: string | null;
      context: string;
      created_at: number;
    }>('SELECT * FROM pending_reports ORDER BY created_at ASC');

    if (rows.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();

    const payload = rows.map((r) => ({
      user_id: user?.id ?? null,
      word: r.word,
      word_id: r.word_id,
      reason: r.reason,
      description: r.description,
      context: r.context,
      created_at: new Date(r.created_at).toISOString(),
    }));

    const { error } = await supabase.from('content_reports').insert(payload);
    if (error) return;

    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM pending_reports WHERE id IN (${placeholders})`, ids);
  } catch {
    // offline — will retry on next sync
  }
}
