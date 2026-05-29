// Direct freedict lookup test — replicates what callDictionary does for
// en/es/fr/de/it source langs (freedictionaryapi.com).
const word = process.argv[2] ?? 'colorado';
const lang = process.argv[3] ?? 'en';

(async () => {
  const url = `https://freedictionaryapi.com/api/v1/entries/${lang}/${encodeURIComponent(word)}`;
  console.log('URL:', url);
  const t0 = Date.now();
  const res = await fetch(url);
  const dt = Date.now() - t0;
  console.log(`HTTP ${res.status} in ${dt}ms`);
  const text = await res.text();
  console.log(text.slice(0, 600));
})();
