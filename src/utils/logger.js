const ts = () => new Date().toISOString();

export function info(msg) {
  console.log(`[INFO ${ts()}] ${msg}`);
}

export function warn(msg) {
  console.warn(`[WARN ${ts()}] ${msg}`);
}

export function error(msg) {
  console.error(`[ERROR ${ts()}] ${msg}`);
}
