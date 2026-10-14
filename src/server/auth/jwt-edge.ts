export interface UserSession {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  twoFactorPassed: boolean;
}

const SECRET = process.env.JWT_SECRET!;

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const binary = String.fromCharCode(...new Uint8Array(signature));
  return base64UrlEncode(binary);
}

export async function signSessionEdge(session: UserSession): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({ ...session, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const data = `${header}.${payload}`;
  const sig = await hmacSha256(data, SECRET);
  return `${data}.${sig}`;
}

export async function verifySessionEdge(token: string): Promise<UserSession | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expectedSig = await hmacSha256(`${header}.${payload}`, SECRET);
    if (sig !== expectedSig) return null;

    const data = JSON.parse(base64UrlDecode(payload));
    if (data.exp && Date.now() > data.exp) return null;
    return data as UserSession;
  } catch {
    return null;
  }
}
