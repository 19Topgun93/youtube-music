// @ts-check
import { open } from 'node:fs/promises';
import path from 'path';

import fs from 'fs-extra';

interface TrackInfo {
  artist: string;
  title: string;
  album: string;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  client_id: string;
  client_secret: string;
}

let accessToken: string | null = null;

const tokenFile = path.join(
  process.env.HOME || '.',
  '.config/YouTube Music/track-logger/yt-token.json',
);

const playlistUrlFile = path.join(
  process.env.HOME || '.',
  '.config/YouTube Music/track-logger/yt-playlist.txt',
);

const trackFileDir = path.join(
  process.env.HOME || '.',
  '.config/YouTube Music/track-logger',
);

const playlistTitle = `🎵 Playlist vom ${new Date().toLocaleDateString()}`;
const playlistDescription =
  'Diese Playlist wurde automatisch aus deiner YouTube Music Session erstellt.';

const readToken = async (): Promise<TokenData | null> => {
  try {
    const file = await open(tokenFile, 'r');
    const content = await file.readFile('utf-8');
    await file.close();
    return JSON.parse(content) as TokenData;
  } catch {
    return null;
  }
};

const saveToken = async (token: TokenData): Promise<void> => {
  await fs.writeJson(tokenFile, token, { spaces: 2 });
};

const getAccessToken = async (): Promise<string> => {
  if (accessToken) return accessToken;

  const token = await readToken();
  if (token) {
    const params = new URLSearchParams({
      refresh_token: token.refresh_token,
      client_id: token.client_id,
      client_secret: token.client_secret,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data: unknown = await res.json();

    if (
      !res.ok ||
      typeof data !== 'object' ||
      data === null ||
      !('access_token' in data)
    ) {
      throw new Error('Fehler beim Aktualisieren des Tokens');
    }

    await saveToken(data as TokenData);
    accessToken = (data as TokenData).access_token;
    return accessToken;
  }

  throw new Error(
    'Kein gültiges Token gefunden. Bitte zuerst ein Token generieren.',
  );
};

const exportPlaylist = async (_tracks: TrackInfo[]): Promise<void> => {
  const token = await getAccessToken();

  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title: playlistTitle,
          description: playlistDescription,
        },
        status: {
          privacyStatus: 'unlisted',
        },
      }),
    },
  );

  const playlistData: unknown = await res.json();

  if (
    !res.ok ||
    typeof playlistData !== 'object' ||
    playlistData === null ||
    !('id' in playlistData)
  ) {
    throw new Error('Fehler beim Erstellen der Playlist');
  }

  const playlistId = (playlistData as { id: string }).id;

  await fs.ensureDir(trackFileDir);
  await fs.writeFile(
    playlistUrlFile,
    `https://www.youtube.com/playlist?list=${playlistId}`,
  );

  console.log(
    `✅ Playlist erstellt: https://www.youtube.com/playlist?list=${playlistId}`,
  );
};

export { exportPlaylist };
