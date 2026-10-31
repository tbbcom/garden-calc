#!/usr/bin/env node
// Prints, as a JSON array, the full URLs of pages whose HTML changed between two page-hash files
// (the live site's /page-hashes.json before this deploy, and the freshly built one).
// Usage: node scripts/indexnow-diff.mjs <old-hashes.json> <new-hashes.json> <site-origin>
import { readFile } from 'node:fs/promises';

const [oldFile, newFile, origin] = process.argv.slice(2);
const load = async (f) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return {}; } };
const before = await load(oldFile);
const after = await load(newFile);
const changed = Object.keys(after).filter((p) => before[p] !== after[p]).sort();
process.stdout.write(JSON.stringify(changed.map((p) => origin + p)));
