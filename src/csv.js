import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { warn } from './utils/logger.js';

export async function loadCsvTargets(filePath, defaultMessage) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(abs, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true });

  const targets = [];
  for (const row of records) {
    const profile = String(row.profile || '').trim();
    if (!profile) continue;
    const message = (row.message && String(row.message).trim()) || defaultMessage || '';

    // match SteamID64 or /profiles/ URL
    let steamid64 = null;
    if (/^\d{17}$/.test(profile)) {
      steamid64 = profile;
    } else {
      const m = profile.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
      if (m) steamid64 = m[1];
    }

    if (!steamid64) {
      warn(`Skipping unsupported profile entry: ${profile}`);
      continue;
    }

    targets.push({ steamid64, message });
  }

  return targets;
}
