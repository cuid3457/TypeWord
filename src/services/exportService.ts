import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { StoredWord } from '@src/db/queries';

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'wordlist';
}

interface Column {
  name: string;
  get: (w: StoredWord) => string;
}

function formatMeanings(w: StoredWord, field: 'definition' | 'partOfSpeech'): string {
  const meanings = w.result.meanings ?? [];
  if (meanings.length === 0) return '';
  if (meanings.length === 1) return meanings[0][field] ?? '';
  // Number each meaning when there are multiple, preserving order so that
  // "1. xxx" in definition aligns with "1. yyy" in part_of_speech.
  return meanings
    .map((m, i) => `${i + 1}. ${m[field] ?? ''}`)
    .join(' | ');
}

function formatExamples(w: StoredWord): string {
  return (w.result.examples ?? [])
    .slice(0, 3)
    .map((ex) =>
      ex.translation && ex.translation.trim().length > 0
        ? `${ex.sentence} — ${ex.translation}`
        : ex.sentence,
    )
    .join(' | ');
}

const ALL_COLUMNS: Column[] = [
  {
    name: 'word',
    get: (w) => w.word,
  },
  {
    name: 'reading',
    get: (w) =>
      Array.isArray(w.result.reading)
        ? w.result.reading.join(' / ')
        : (w.result.reading ?? ''),
  },
  {
    name: 'definition',
    get: (w) => formatMeanings(w, 'definition'),
  },
  {
    name: 'part_of_speech',
    get: (w) => formatMeanings(w, 'partOfSpeech'),
  },
  {
    name: 'examples',
    get: formatExamples,
  },
  {
    name: 'synonyms',
    get: (w) => (w.result.synonyms ?? []).join(' | '),
  },
  {
    name: 'antonyms',
    get: (w) => (w.result.antonyms ?? []).join(' | '),
  },
  {
    name: 'source_sentence',
    get: (w) => w.sourceSentence ?? '',
  },
  {
    name: 'added_at',
    get: (w) => new Date(w.createdAt).toISOString().slice(0, 10),
  },
];

// Optional columns: included only when at least one word has content.
const OPTIONAL_COLUMNS = new Set(['reading', 'synonyms', 'antonyms', 'source_sentence']);

/**
 * Build CSV string from saved words.
 * Optional columns (reading, synonyms, antonyms) are auto-omitted when
 * every row is empty — keeps the file clean for languages/wordlists that
 * don't have that data.
 */
export function buildCsv(words: StoredWord[]): string {
  const cellsByColumn = ALL_COLUMNS.map((col) => words.map(col.get));

  const activeColumns = ALL_COLUMNS.filter((col, idx) => {
    if (!OPTIONAL_COLUMNS.has(col.name)) return true;
    return cellsByColumn[idx].some((v) => v.trim().length > 0);
  });
  const activeIndices = activeColumns.map((col) => ALL_COLUMNS.indexOf(col));

  const header = activeColumns.map((c) => c.name).join(',');
  const rows = words.map((_, rowIdx) =>
    activeIndices.map((colIdx) => csvEscape(cellsByColumn[colIdx][rowIdx])).join(','),
  );

  return [header, ...rows].join('\n');
}

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Write the CSV to a temp file and open the native share sheet.
 * Filename includes today's date (e.g. "ㅁㅁ_2026-04-26.csv") so receiving
 * apps like KakaoTalk that auto-suffix duplicates don't append numbers
 * for everyday exports.
 */
export async function exportWordlistCsv(
  bookTitle: string,
  words: StoredWord[],
): Promise<void> {
  const csv = buildCsv(words);
  const fileName = `${sanitizeFileName(bookTitle)}_${todayStamp()}.csv`;

  const file = new File(Paths.cache, fileName);
  // overwrite existing temp file from a prior export
  try {
    file.delete();
  } catch {
    // file did not exist — fine
  }
  file.create();
  file.write(csv);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing not available on this device');
  }

  // Use application/octet-stream (generic binary) so messaging apps like
  // KakaoTalk treat it as a true file attachment rather than scanning for
  // text content. The .csv extension on the filename ensures the receiving
  // OS still recognizes the format on open.
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: bookTitle,
    UTI: 'public.comma-separated-values-text',
  });
}

// ── PDF export — premium-only "study sheet" format ────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function meaningsHtml(w: StoredWord): string {
  const meanings = w.result.meanings ?? [];
  if (meanings.length === 0) return '';
  return meanings
    .map((m) => {
      const pos = m.partOfSpeech ? `<span class="pos">${escapeHtml(m.partOfSpeech)}</span>` : '';
      return `<div class="meaning">${pos}<span class="def">${escapeHtml(m.definition ?? '')}</span></div>`;
    })
    .join('');
}

function examplesHtml(w: StoredWord): string {
  const examples = (w.result.examples ?? []).slice(0, 2);
  if (examples.length === 0) return '';
  return (
    `<div class="examples">` +
    examples
      .map((ex) => {
        // Strip ** markers, preserve the marked word highlighting.
        const sentence = (ex.sentence ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        const trans = (ex.translation ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        return `<div class="ex"><div class="ex-s">${sentence}</div>${trans ? `<div class="ex-t">${trans}</div>` : ''}</div>`;
      })
      .join('') +
    `</div>`
  );
}

export interface PdfLabels {
  /** Localized "Synonyms" label, displayed before the synonym list. */
  synonyms: string;
  /** Localized "Antonyms" label. */
  antonyms: string;
  /** Suffix that follows the word count, e.g. "단어" / "words" / "palabras". */
  wordsSuffix: string;
}

function buildPdfHtml(bookTitle: string, words: StoredWord[], labels: PdfLabels): string {
  const today = todayStamp();
  const cards = words
    .map((w) => {
      const reading = Array.isArray(w.result.reading)
        ? w.result.reading.join(' / ')
        : w.result.reading ?? '';
      const ipa = w.result.ipa ?? '';
      const meta = [reading, ipa].filter((s) => s).join('   ·   ');
      const synonyms = (w.result.synonyms ?? []).join(', ');
      const antonyms = (w.result.antonyms ?? []).join(', ');
      const synAntHtml = [
        synonyms ? `<div class="syn-row"><span class="lbl">${escapeHtml(labels.synonyms)}</span> ${escapeHtml(synonyms)}</div>` : '',
        antonyms ? `<div class="syn-row"><span class="lbl">${escapeHtml(labels.antonyms)}</span> ${escapeHtml(antonyms)}</div>` : '',
      ]
        .filter((s) => s)
        .join('');
      return `
        <section class="card">
          <header class="card-h">
            <h2>${escapeHtml(w.word)}</h2>
            ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
          </header>
          ${meaningsHtml(w)}
          ${examplesHtml(w)}
          ${synAntHtml}
        </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", "Noto Sans CJK KR", Roboto, sans-serif; color: #111; -webkit-print-color-adjust: exact; }
  header.doc { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 18px; }
  header.doc h1 { font-size: 22px; margin: 0; }
  header.doc .date { font-size: 11px; color: #6b7280; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
  .card { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; page-break-inside: avoid; }
  .card-h h2 { font-size: 16px; margin: 0 0 2px; font-weight: 700; }
  .card-h .meta { font-size: 10px; color: #6b7280; margin-bottom: 6px; }
  .meaning { font-size: 12px; line-height: 1.5; margin-bottom: 2px; }
  .meaning .pos { display: inline-block; font-size: 9px; color: #6b7280; background: #f3f4f6; padding: 1px 5px; border-radius: 3px; margin-right: 5px; }
  .meaning .def { color: #111; }
  .examples { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e5e7eb; }
  .ex { font-size: 10.5px; line-height: 1.45; margin-bottom: 3px; }
  .ex-s { color: #111; }
  .ex-s b { color: #2EC4A5; font-weight: 700; }
  .ex-t { color: #6b7280; }
  .ex-t b { color: #2EC4A5; font-weight: 600; }
  .syn-row { font-size: 10px; color: #4b5563; margin-top: 4px; }
  .syn-row .lbl { font-size: 8px; color: #9ca3af; text-transform: uppercase; margin-right: 4px; }
  footer { margin-top: 18px; font-size: 9px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
  <header class="doc">
    <h1>${escapeHtml(bookTitle)}</h1>
    <div class="date">${today} · ${words.length} ${escapeHtml(labels.wordsSuffix)}</div>
  </header>
  <div class="grid">${cards}</div>
  <footer>TypeWord</footer>
</body>
</html>`;
}

/**
 * Render the wordlist as a printable two-column "study sheet" PDF and open
 * the native share sheet. Premium-only feature (CSV stays free for GDPR
 * portability compliance).
 */
export async function exportWordlistPdf(
  bookTitle: string,
  words: StoredWord[],
  labels: PdfLabels,
): Promise<void> {
  const html = buildPdfHtml(bookTitle, words, labels);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // Move the auto-generated tmp file to a friendly filename so the share
  // sheet (and eventual recipient) sees a meaningful name.
  const friendlyName = `${sanitizeFileName(bookTitle)}_${todayStamp()}.pdf`;
  const finalFile = new File(Paths.cache, friendlyName);
  try { finalFile.delete(); } catch { /* not present */ }
  const srcFile = new File(uri);
  srcFile.move(finalFile);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing not available on this device');
  }

  await Sharing.shareAsync(finalFile.uri, {
    mimeType: 'application/pdf',
    dialogTitle: bookTitle,
    UTI: 'com.adobe.pdf',
  });
}
