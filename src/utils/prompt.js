import readline from 'readline';

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

export function ask(question) {
  const rl = createInterface();
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

export async function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdout.write('\n');
          process.stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.write('*');
          break;
      }
    };
    process.stdin.on('data', onData);
    rl.question(question, (value) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      resolve(value);
    });
  });
}

export async function askNumber(question, defaultValue = null) {
  const ans = await ask(question);
  const n = Number(ans);
  if (Number.isFinite(n)) return n;
  if (defaultValue !== null) return defaultValue;
  return NaN;
}

export async function askChoice(question, choices) {
  const display = choices.map((c, i) => `  ${i + 1}) ${c}`).join('\n');
  const ans = await ask(`${question}\n${display}\nSelecciona una opción [1-${choices.length}]: `);
  const idx = parseInt(ans, 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx];
  return null;
}
