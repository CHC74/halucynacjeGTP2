#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Walidator względnych linków Markdown (AGENTS.md sekcja 3)
 */
import fs from 'node:fs';
import path from 'node:path';

function collectMarkdownFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

const files = collectMarkdownFiles('.');
let broken = 0;
let total = 0;

for (const file of files) {
  const txt = fs.readFileSync(file, 'utf8');
  for (const match of txt.matchAll(/\[[^\]]+\]\(([^)#\s]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|file:)/i.test(target)) continue;
    total++;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Martwy link w ${file} -> ${target}`);
      broken++;
    }
  }
}

if (broken > 0) {
  console.error(`❌ Znaleziono ${broken} martwych linków (sprawdzono ${total}).`);
  process.exit(1);
}

console.log(`✅ Linki Markdown OK: sprawdzono ${total} względnych odnośników w ${files.length} plikach.`);
