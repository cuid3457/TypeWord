import type { StoredWord } from '@src/db/queries';
import { isPaid } from '@src/services/subscriptionService';

export class PaidFeatureRequiredError extends Error {
  code = 'paid_feature_required' as const;
  constructor() {
    super('paid_feature_required');
  }
}

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
  { name: 'word', get: (w) => w.word },
  {
    name: 'reading',
    get: (w) =>
      Array.isArray(w.result.reading)
        ? w.result.reading.join(' / ')
        : (w.result.reading ?? ''),
  },
  { name: 'definition', get: (w) => formatMeanings(w, 'definition') },
  { name: 'part_of_speech', get: (w) => formatMeanings(w, 'partOfSpeech') },
  { name: 'examples', get: formatExamples },
  { name: 'synonyms', get: (w) => (w.result.synonyms ?? []).join(' | ') },
  { name: 'antonyms', get: (w) => (w.result.antonyms ?? []).join(' | ') },
  { name: 'source_sentence', get: (w) => w.sourceSentence ?? '' },
  {
    name: 'added_at',
    get: (w) => new Date(w.createdAt).toISOString().slice(0, 10),
  },
];

const OPTIONAL_COLUMNS = new Set(['reading', 'synonyms', 'antonyms', 'source_sentence']);

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

// Trigger a browser download by creating a Blob, an object URL, and a
// transient <a download> click. Works in every evergreen browser without
// requiring user gestures beyond the original button press.
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportWordlistCsv(
  bookTitle: string,
  words: StoredWord[],
): Promise<void> {
  const csv = buildCsv(words);
  const fileName = `${sanitizeFileName(bookTitle)}_${todayStamp()}.csv`;
  // Prepend BOM so Excel opens UTF-8 CSVs (e.g. Korean/Japanese) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, fileName);
}

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
        const sentence = (ex.sentence ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        const trans = (ex.translation ?? '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        return `<div class="ex"><div class="ex-s">${sentence}</div>${trans ? `<div class="ex-t">${trans}</div>` : ''}</div>`;
      })
      .join('') +
    `</div>`
  );
}

export interface PdfLabels {
  synonyms: string;
  antonyms: string;
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
<title>${escapeHtml(bookTitle)}</title>
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
  @media print { footer { position: fixed; bottom: 4mm; left: 0; right: 0; } }
</style>
</head>
<body>
  <header class="doc">
    <h1>${escapeHtml(bookTitle)}</h1>
    <div class="date">${today} · ${words.length} ${escapeHtml(labels.wordsSuffix)}</div>
  </header>
  <div class="grid">${cards}</div>
  <footer>MoaVoca</footer>
  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body>
</html>`;
}

// Web PDF "export" opens the rendered HTML in a new tab and auto-triggers
// the browser's print dialog. The user picks "Save as PDF" as the
// destination — same result as the native expo-print flow, without
// requiring a server-side renderer.
export async function exportWordlistPdf(
  bookTitle: string,
  words: StoredWord[],
  labels: PdfLabels,
): Promise<void> {
  if (!isPaid()) {
    throw new PaidFeatureRequiredError();
  }
  const html = buildPdfHtml(bookTitle, words, labels);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked — fall back to direct download of the HTML so the user
    // can open it themselves.
    const fileName = `${sanitizeFileName(bookTitle)}_${todayStamp()}.html`;
    triggerDownload(blob, fileName);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
