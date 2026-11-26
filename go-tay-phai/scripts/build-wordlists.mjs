#!/usr/bin/env node
/**
 * Builds src/data/words/{en,vi}-{200,1000}.json from the hermitdave/FrequencyWords
 * frequency lists (OpenSubtitles 2018, CC BY-SA 4.0).
 *
 * Usage:
 *   node scripts/build-wordlists.mjs                 # downloads into scripts/.cache
 *   node scripts/build-wordlists.mjs --en a.txt --vi b.txt
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVietnameseSyllable, nfc, normalizeToneStyle } from '../src/lib/vietnamese.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache');
const outDir = join(root, 'src', 'data', 'words');
const SOURCE = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018';
const SIZES = [200, 1000];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function source(lang) {
  const given = arg(lang);
  if (given) return readFile(resolve(given), 'utf8');
  const file = join(cacheDir, `${lang}_50k.txt`);
  if (!existsSync(file)) {
    const url = `${SOURCE}/${lang}/${lang}_50k.txt`;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, await res.text());
  }
  return readFile(file, 'utf8');
}

/** Parses "word count" lines into [word, count] pairs, most frequent first. */
function parse(text) {
  return text
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((p) => p.length === 2 && /^\d+$/.test(p[1]))
    .map(([w, c]) => [w, Number(c)]);
}

// --- English -----------------------------------------------------------------

/** Contraction fragments, profanity, slurs and common first names. */
const EN_BLOCK = new Set(
  `
  re ll ve don didn doesn isn wasn aren weren couldn wouldn shouldn haven hasn hadn won ain
  gonna wanna gotta yeah yea ok okay hey uh um oh huh hmm mm ah eh yo ha wow whoa
  fuck fucking fucked fucker shit shitty damn goddamn hell ass asshole bitch bastard dick cock
  pussy cunt whore slut piss crap bloody sex sexy nigga nigger fag faggot retard porn rape
  john michael david peter paul jack mike tom sam frank charlie harry george james joe
  max nick ben danny bob billy jimmy alex ray steve henry eddie tony jerry kevin chris
  mary sarah anna jane kate emma lucy amy rachel lisa susan alice laura jenny
  mr mrs ms dr st uh-huh tv em ma la lt ya ooh mmm
  sighs laughs laughing chuckles laughter screaming continues groans grunts gasps
  jesus christ york america american english french christmas
  `
    .split(/\s+/)
    .filter(Boolean),
);

function buildEnglish(pairs) {
  const out = [];
  for (const [w] of pairs) {
    if (!/^[a-z]+$/.test(w)) continue;
    if (w.length === 1 && w !== 'a' && w !== 'i') continue;
    if (EN_BLOCK.has(w)) continue;
    out.push(w);
  }
  return out;
}

// --- Vietnamese ----------------------------------------------------------------

/** English tokens that pass the syllable check, profanity, interjections and junk. */
const VI_BLOCK = new Set(
  `
  the me so bye hi oh ok yo i u y ư
  địt đụ lồn cặc đéo đếch buồi đĩ đít đcm vl vcl chó-chết mẹ-kiếp
  ê à ạ ừ ồ ơ ờ ô a á ả ừm hả hử ủa ối ui ái chà
  `
    .split(/\s+/)
    .filter(Boolean),
);

function buildVietnamese(pairs) {
  const counts = new Map();
  const order = [];
  for (const [raw, count] of pairs) {
    const w = nfc(raw);
    if (!isVietnameseSyllable(w)) continue;
    const display = normalizeToneStyle(w);
    if (VI_BLOCK.has(display)) continue;
    if (!counts.has(display)) order.push(display);
    counts.set(display, (counts.get(display) ?? 0) + count);
  }
  return order.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
}

// --- main ----------------------------------------------------------------------

async function main() {
  await mkdir(outDir, { recursive: true });
  const lists = {
    en: buildEnglish(parse(await source('en'))),
    vi: buildVietnamese(parse(await source('vi'))),
  };
  for (const [lang, words] of Object.entries(lists)) {
    for (const size of SIZES) {
      const top = words.slice(0, size);
      if (top.length < size) throw new Error(`${lang}: only ${top.length} words`);
      const file = join(outDir, `${lang}-${size}.json`);
      await writeFile(file, `${JSON.stringify(top)}\n`);
      console.log(`${file}: ${top.length} words`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
