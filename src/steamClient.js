import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import SteamTotp from 'steam-totp';
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { info, warn } from './utils/logger.js';
import { delay } from './utils/delay.js';

function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

const SESSION_DIR = path.resolve(process.cwd(), '.session');

async function ensureSessionDir() {
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
  } catch {}
}

function getSessionFile(username) {
  const safe = String(username || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(SESSION_DIR, `${safe}.json`);
}

async function readLoginKey(username) {
  try {
    const file = getSessionFile(username);
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data && typeof data.loginKey === 'string' && data.loginKey) return data.loginKey;
  } catch {}
  return null;
}

async function writeLoginKey(username, loginKey) {
  try {
    await ensureSessionDir();
    const file = getSessionFile(username);
    await fs.writeFile(file, JSON.stringify({ loginKey }, null, 2), 'utf8');
  } catch {}
}

async function tryLoginOnce({ username, password, sharedSecret, oneTimeCode, loginKey, onLoginKey }) {
  const user = new SteamUser();
  const community = new SteamCommunity();

  const logOnOptions = { accountName: username };
  if (loginKey) {
    logOnOptions.loginKey = loginKey;
  } else {
    logOnOptions.password = password;
    if (sharedSecret) {
      logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(sharedSecret);
    }
  }

  return await new Promise((resolve, reject) => {
    let guardRequested = false;
    user.logOn(logOnOptions);

    user.on('steamGuard', async (domain, callback, lastCodeWrong) => {
      // With loginKey we shouldn't get here; if we do, treat like password flow
      guardRequested = true;
      warn(`Steam Guard required${domain ? ' (' + domain + ')' : ''}${lastCodeWrong ? ' (last code wrong)' : ''}.`);
      if (oneTimeCode) {
        const code = String(oneTimeCode).trim();
        oneTimeCode = undefined; // consume once
        callback(code);
      } else if (sharedSecret) {
        const code = SteamTotp.generateAuthCode(sharedSecret);
        callback(code);
      } else {
        const code = await askQuestion('Enter Steam Guard code: ');
        callback(code.trim());
      }
    });

    user.on('loginKey', async (key) => {
      try { await onLoginKey?.(key); } catch {}
    });

    user.on('loggedOn', () => {
      info('Logged on to Steam.');
    });

    user.on('error', (err) => {
      reject(err);
    });

    user.on('webSession', (sessionid, cookies) => {
      community.setCookies(cookies);
      resolve({ user, community, guardRequested });
    });
  });
}

export async function loginAndGetCommunity({ username, password, sharedSecret, oneTimeCode }) {
  await ensureSessionDir();

  // Helper to attempt login with retries on rate limit
  async function loginWithRetries(flowName, attemptFn, { maxRetries = 3, baseWaitSec = 120 } = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await attemptFn();
      } catch (err) {
        const msg = String(err?.message || '');
        const isRate = msg.toLowerCase().includes('ratelimit') || msg.toLowerCase().includes('rate limit');
        if (!isRate || attempt >= maxRetries) {
          throw err;
        }
        const waitSec = Math.floor(baseWaitSec * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 15); // up to +15s
        const totalMs = (waitSec + jitter) * 1000;
        warn(`[${flowName}] Rate limited. Waiting ${waitSec + jitter}s before retry ${attempt + 1}/${maxRetries}...`);
        await delay(totalMs);
        attempt++;
      }
    }
  }

  const existingKey = await readLoginKey(username);

  // 1) Try with loginKey if available (with retries on rate limit)
  if (existingKey) {
    try {
      const { user, community } = await loginWithRetries('loginKey', () => tryLoginOnce({
        username,
        loginKey: existingKey,
        onLoginKey: async (key) => { await writeLoginKey(username, key); },
      }));
      return { user, community };
    } catch (err) {
      warn('Stored loginKey failed, falling back to password + 2FA...');
    }
  }

  // 2) Fallback: password + 2FA (with retries on rate limit)
  const { user, community } = await loginWithRetries('password+2FA', () => tryLoginOnce({
    username,
    password,
    // Prefer oneTimeCode if provided; else sharedSecret for TOTP generation
    sharedSecret,
    onLoginKey: async (key) => { await writeLoginKey(username, key); },
  }));
  return { user, community };
}
