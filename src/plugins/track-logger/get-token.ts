import http from 'http';

import path from 'path';

import fs from 'fs-extra';

import open from 'open';

interface TokenData {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;

  client_id?: string;
  client_secret?: string;

  [key: string]: unknown;
}

const trackLoggerDir = path.join(
  process.env.HOME || '.',
  '.config/YouTube Music/track-logger',
);

const clientSecretPath = path.join(trackLoggerDir, 'client_secret.json');
const tokenOutputPath = path.join(trackLoggerDir, 'yt-token.json');

interface InstalledClientSecrets {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

interface ClientSecrets {
  installed: InstalledClientSecrets;
}

const readClientSecrets = async (): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> => {
  const content = (await fs.readJson(clientSecretPath)) as ClientSecrets;
  const { clientId, clientSecret, redirectUris } = content.installed;
  return {
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: redirectUris[0],
  };
};

const getAuthCode = async (
  clientId: string,
  redirectUri: string,
): Promise<string> => {
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
      access_type: 'offline',
      prompt: 'consent',
    }).toString();

  console.log(
    '\nBitte öffne folgenden Link in deinem Browser und autorisiere die Anwendung:',
  );
  console.log(authUrl);
  await open(authUrl);

  return await new Promise<string>((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      const code = url.searchParams.get('code');
      res.end('✅ Code erhalten. Du kannst dieses Fenster schließen.');
      server.close();
      resolve(code || '');
    });
    server.listen(3000, () => {
      console.log('Warte auf Autorisierungscode unter http://localhost:3000');
    });
  });
};

const exchangeCodeForToken = async ({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenData> => {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const rawToken = await response.json();

  if (!response.ok) {
    throw new Error(
      `Fehler beim Abrufen des Tokens: ${JSON.stringify(rawToken)}`,
    );
  }

  return {
    ...(rawToken as TokenData),
    client_id: clientId,
    client_secret: clientSecret,
  };
};

const main = async (): Promise<void> => {
  const { clientId, clientSecret, redirectUri } = await readClientSecrets();
  const code = await getAuthCode(clientId, redirectUri);
  const token = await exchangeCodeForToken({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });
  await fs.writeJson(tokenOutputPath, token, { spaces: 2 });
  console.log('\n✅ Token gespeichert in:', tokenOutputPath);
};

main().catch((err: unknown) => {
  console.error('❌ Fehler beim Erzeugen des Tokens:', err);
});
