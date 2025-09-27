import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadCsvTargets } from './csv.js';
import { loginAndGetCommunity } from './steamClient.js';
import { postCommentSafe } from './commenter.js';
import { delayRandom, delay } from './utils/delay.js';
import { info, warn, error as logError } from './utils/logger.js';
import { ask, askHidden, askNumber, askChoice } from './utils/prompt.js';

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', describe: 'Steam username' })
  .option('pass', { type: 'string', describe: 'Steam password' })
  .option('sharedSecret', { type: 'string', describe: 'Steam shared secret for TOTP (optional)' })
  .option('code', { type: 'string', describe: 'One-time Steam Guard code (TOTP or email) for this login' })
  .option('file', { type: 'string', describe: 'CSV file with targets' })
  .option('profile', { type: 'string', describe: 'Single target: SteamID64 or /profiles/ URL' })
  .option('message', { type: 'string', describe: 'Default comment message' })
  .option('count', { type: 'number', default: 1, describe: 'Number of times to post the message to the single --profile target' })
  .option('intervalSec', { type: 'number', describe: 'Fixed interval between comments, in seconds (overrides min/max delay if provided)' })
  .option('minDelay', { type: 'number', default: parseInt(process.env.MIN_DELAY_MS || '30000', 10) })
  .option('maxDelay', { type: 'number', default: parseInt(process.env.MAX_DELAY_MS || '90000', 10) })
  .option('interactive', { type: 'boolean', default: false, describe: 'Run in interactive mode with prompts' })
  .demandOption([], 'Provide either --file or --profile')
  .strict()
  .help()
  .argv;

function getEnvOrArg(name, argValue, envName) {
  return argValue || process.env[envName];
}

function parseSteamIdOrProfile(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (/^\d{17}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return m[1];
  return null; // vanity not supported
}

async function main() {
  let username = getEnvOrArg('user', argv.user, 'STEAM_USERNAME');
  let password = getEnvOrArg('pass', argv.pass, 'STEAM_PASSWORD');
  let sharedSecret = getEnvOrArg('sharedSecret', argv.sharedSecret, 'STEAM_SHARED_SECRET');
  let defaultMessage = argv.message || process.env.DEFAULT_MESSAGE || '';
  let minDelay = argv.minDelay;
  let maxDelay = argv.maxDelay;
  let fixedIntervalMs = (typeof argv.intervalSec === 'number' && !Number.isNaN(argv.intervalSec))
    ? Math.max(0, Math.floor(argv.intervalSec * 1000))
    : null;

  // Interactive mode to collect inputs securely and nicely
  if (argv.interactive) {
    // Credentials
    if (!username) username = (await ask('Usuario de Steam: ')).trim();
    if (!password) password = await askHidden('Contraseña de Steam (oculta): ');
    if (!sharedSecret) {
      const maybeSS = await ask('Shared secret TOTP (opcional, Enter para omitir): ');
      sharedSecret = maybeSS.trim() || undefined;
    }

    // Choose mode
    const mode = await askChoice('¿Qué quieres usar?', ['Un solo perfil (SteamID64 o /profiles/ URL)', 'Archivo CSV (targets.csv)']);
    let targetsInteractive = [];
    let singleProfileMode = false;
    if (mode === 'Un solo perfil (SteamID64 o /profiles/ URL)') {
      singleProfileMode = true;
      const prof = (await ask('Perfil destino (SteamID64 o URL /profiles/): ')).trim();
      const sid = parseSteamIdOrProfile(prof);
      if (!sid) throw new Error('Perfil inválido. Debe ser SteamID64 o URL /profiles/<id>.');
      if (!defaultMessage) defaultMessage = (await ask('Mensaje a publicar (deja vacío para ninguno): '));
      const countAns = await askNumber('¿Cuántas veces repetir? [1 por defecto]: ', 1);
      const count = Math.max(1, Number.isFinite(countAns) ? countAns : 1);

      // Delay choice
      const delayMode = await askChoice('Tipo de intervalo entre comentarios', ['Fijo (segundos)', 'Aleatorio (min/max ms)']);
      if (delayMode === 'Fijo (segundos)') {
        const sec = await askNumber('Intervalo fijo en segundos (ej. 60): ', 60);
        fixedIntervalMs = Math.max(0, Math.floor((Number.isFinite(sec) ? sec : 60) * 1000));
      } else {
        const min = await askNumber('Min delay ms (ej. 30000): ', 30000);
        const max = await askNumber('Max delay ms (ej. 90000): ', 90000);
        minDelay = Math.max(0, Number.isFinite(min) ? min : 30000);
        maxDelay = Math.max(minDelay, Number.isFinite(max) ? max : 90000);
        fixedIntervalMs = null;
      }

      for (let i = 0; i < count; i++) {
        targetsInteractive.push({ steamid64: sid, message: defaultMessage });
      }
    } else {
      const filePath = (await ask('Ruta CSV (por defecto targets.csv): ')).trim() || (process.env.CSV_PATH || 'targets.csv');
      const maybeMsg = await ask('Mensaje por defecto (Enter para mantener actual): ');
      if (maybeMsg.trim()) defaultMessage = maybeMsg;
      // Delay choice
      const delayMode = await askChoice('Tipo de intervalo entre comentarios', ['Fijo (segundos)', 'Aleatorio (min/max ms)']);
      if (delayMode === 'Fijo (segundos)') {
        const sec = await askNumber('Intervalo fijo en segundos (ej. 60): ', 60);
        fixedIntervalMs = Math.max(0, Math.floor((Number.isFinite(sec) ? sec : 60) * 1000));
      } else {
        const min = await askNumber('Min delay ms (ej. 30000): ', 30000);
        const max = await askNumber('Max delay ms (ej. 90000): ', 90000);
        minDelay = Math.max(0, Number.isFinite(min) ? min : 30000);
        maxDelay = Math.max(minDelay, Number.isFinite(max) ? max : 90000);
        fixedIntervalMs = null;
      }
      targetsInteractive = await loadCsvTargets(filePath, defaultMessage);
    }

    if (targetsInteractive.length === 0) {
      warn('No hay objetivos para procesar. Saliendo.');
      return;
    }

    // Confirmation (do not print secrets)
    info('Resumen de ejecución:');
    info(`- Objetivos: ${targetsInteractive.length}`);
    if (fixedIntervalMs !== null) {
      info(`- Intervalo fijo: ${fixedIntervalMs} ms`);
    } else {
      info(`- Delay aleatorio: ${minDelay}-${maxDelay} ms`);
    }
    info(`- Mensaje por defecto: ${defaultMessage ? 'definido' : 'vacío'}`);
    const proceed = await ask('¿Continuar? (s/N): ');
    if (!/^s/i.test(proceed.trim())) {
      info('Cancelado por el usuario.');
      return;
    }

    // Override argv-derived targets
    argv.profile = undefined;
    argv.file = undefined;
    // Use local variables below
    var prebuiltTargets = targetsInteractive;
  }

  if (!username || !password) {
    throw new Error('Missing credentials: provide --user/--pass or set STEAM_USERNAME/STEAM_PASSWORD in .env');
  }

  let targets = [];
  let singleProfileMode = false;
  if (typeof prebuiltTargets !== 'undefined') {
    targets = prebuiltTargets;
  } else if (argv.profile) {
    const sid = parseSteamIdOrProfile(argv.profile);
    if (!sid) {
      throw new Error('Invalid --profile. Provide SteamID64 or a /profiles/<id> URL. Vanity URLs are not supported.');
    }
    singleProfileMode = true;
    const count = Math.max(1, Number(argv.count) || 1);
    for (let i = 0; i < count; i++) {
      targets.push({ steamid64: sid, message: defaultMessage });
    }
  } else if (argv.file || process.env.CSV_PATH) {
    const filePath = argv.file || process.env.CSV_PATH;
    targets = await loadCsvTargets(filePath, defaultMessage);
  } else {
    throw new Error('You must provide either --profile or --file (or CSV_PATH in .env).');
  }

  if (targets.length === 0) {
    warn('No targets to process. Exiting.');
    return;
  }

  info('Logging in ...');
  const { community } = await loginAndGetCommunity({ username, password, sharedSecret, oneTimeCode: argv.code });
  info('Login successful. Starting to post comments...');

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    info(`[${i + 1}/${targets.length}] Commenting on ${t.steamid64}`);
    try {
      await postCommentSafe(community, t.steamid64, t.message || defaultMessage);
      info(`Posted to ${t.steamid64}`);
    } catch (e) {
      logError(`Failed for ${t.steamid64}: ${e.message || e}`);
    }

    if (i < targets.length - 1) {
      let ms;
      if (fixedIntervalMs !== null) {
        ms = await delay(fixedIntervalMs);
      } else {
        ms = await delayRandom(minDelay, maxDelay);
      }
      info(`Waiting ${ms}ms before next comment...`);
    }
  }

  info('Done.');
}

main().catch((e) => {
  logError(e?.stack || e?.message || String(e));
  process.exit(1);
});
