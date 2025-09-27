import SteamID from 'steamid';

function toSteamId64(input) {
  if (/^\d{17}$/.test(input)) return input;
  // Only /profiles/ URLs supported externally. Here we just ensure it's 64-bit.
  throw new Error('Invalid SteamID64 provided to toSteamId64');
}

export async function postCommentSafe(community, steamidOr64, message) {
  const steamid64 = toSteamId64(String(steamidOr64));
  const sid = new SteamID(steamid64);

  return new Promise((resolve, reject) => {
    community.postUserComment(sid, message, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
