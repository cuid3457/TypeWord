#!/usr/bin/env node
// Bumps marketing patch version (X.Y.Z → X.Y.Z+1) in app.json, package.json,
// ios Info.plist, and android build.gradle. Also increments per-platform
// build numbers (CFBundleVersion, versionCode).
//
// Triggered automatically by Android `gradle assembleRelease`/`bundleRelease`
// (via android/settings.gradle) and by Xcode Archive (via scheme PreAction).
// Skip with `SKIP_BUMP=1`.
//
// Re-entry guard: if another bump finished within BUMP_WINDOW_MIN minutes,
// skip — this keeps Android+iOS in sync when both are built in one release
// cycle. Override with `FORCE_BUMP=1`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const APP_JSON = resolve(ROOT, 'app.json');
const PKG_JSON = resolve(ROOT, 'package.json');
const INFO_PLIST = resolve(ROOT, 'ios/TypeWord/Info.plist');
const BUILD_GRADLE = resolve(ROOT, 'android/app/build.gradle');
const MARKER = resolve(ROOT, 'scripts/.last-version-bump');

const BUMP_WINDOW_MIN = 60;

function log(msg) {
  process.stdout.write(`[bump-version] ${msg}\n`);
}

if (process.env.SKIP_BUMP === '1') {
  log('SKIP_BUMP=1, skipping');
  process.exit(0);
}

if (process.env.FORCE_BUMP !== '1' && existsSync(MARKER)) {
  const last = Number(readFileSync(MARKER, 'utf8').trim()) || 0;
  const ageMin = (Date.now() - last) / 1000 / 60;
  if (ageMin < BUMP_WINDOW_MIN) {
    log(`last bump ${ageMin.toFixed(1)}m ago (< ${BUMP_WINDOW_MIN}m), skipping. Use FORCE_BUMP=1 to override.`);
    process.exit(0);
  }
}

// 1. app.json — source of truth for marketing version
const appJsonText = readFileSync(APP_JSON, 'utf8');
const appJson = JSON.parse(appJsonText);
const current = appJson.expo.version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) {
  log(`unexpected version format: ${current}`);
  process.exit(1);
}
const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
log(`marketing version: ${current} → ${next}`);

// Preserve formatting: replace just the version string
writeFileSync(
  APP_JSON,
  appJsonText.replace(
    /("version"\s*:\s*)"\d+\.\d+\.\d+"/,
    `$1"${next}"`,
  ),
);

// 2. package.json — keep in sync
const pkgText = readFileSync(PKG_JSON, 'utf8');
writeFileSync(
  PKG_JSON,
  pkgText.replace(
    /("version"\s*:\s*)"\d+\.\d+\.\d+"/,
    `$1"${next}"`,
  ),
);

// 3. iOS Info.plist — bump CFBundleShortVersionString + CFBundleVersion
const plistText = readFileSync(INFO_PLIST, 'utf8');
const shortRe = /(<key>CFBundleShortVersionString<\/key>\s*<string>)\d+\.\d+\.\d+(<\/string>)/;
const buildRe = /(<key>CFBundleVersion<\/key>\s*<string>)(\d+)(<\/string>)/;
const iosBuildMatch = buildRe.exec(plistText);
const iosBuild = iosBuildMatch ? Number(iosBuildMatch[2]) + 1 : 1;
const newPlist = plistText
  .replace(shortRe, `$1${next}$2`)
  .replace(buildRe, `$1${iosBuild}$3`);
writeFileSync(INFO_PLIST, newPlist);
log(`iOS CFBundleVersion: ${iosBuildMatch?.[2] ?? '?'} → ${iosBuild}`);

// 4. Android build.gradle — bump versionName + versionCode
const gradleText = readFileSync(BUILD_GRADLE, 'utf8');
const codeRe = /(versionCode\s+)(\d+)/;
const nameRe = /(versionName\s+)"(\d+\.\d+\.\d+)"/;
const codeMatch = codeRe.exec(gradleText);
const androidCode = codeMatch ? Number(codeMatch[2]) + 1 : 1;
const newGradle = gradleText
  .replace(codeRe, `$1${androidCode}`)
  .replace(nameRe, `$1"${next}"`);
writeFileSync(BUILD_GRADLE, newGradle);
log(`Android versionCode: ${codeMatch?.[2] ?? '?'} → ${androidCode}`);

// 5. Update marker
writeFileSync(MARKER, String(Date.now()));
log(`done. version → ${next}`);
