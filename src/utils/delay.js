export async function delay(ms) {
  await new Promise((res) => setTimeout(res, ms));
  return ms;
}

export async function delayRandom(minMs, maxMs) {
  const min = Math.max(0, Number(minMs) || 0);
  const max = Math.max(min, Number(maxMs) || min);
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}
