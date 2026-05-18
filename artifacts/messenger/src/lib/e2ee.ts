const RSA_ALGO = { name: "RSA-OAEP", hash: "SHA-256" };
const AES_ALGO = { name: "AES-GCM", length: 256 };
const PBKDF2_ALGO = "PBKDF2";
const KEY_USAGE = { name: "RSA-OAEP", hash: "SHA-256" };

function ab2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b642ab(b64: string): ArrayBuffer {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function publicKeyToPem(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return `-----BEGIN PUBLIC KEY-----\n${ab2b64(spki)}\n-----END PUBLIC KEY-----`;
}

export async function privateKeyToPKCS8(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
  return ab2b64(pkcs8);
}

export async function pemToPublicKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s/g, "");
  return crypto.subtle.importKey("spki", b642ab(b64), KEY_USAGE, true, ["encrypt"]);
}

export async function pkcs8ToPrivateKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", b642ab(b64), KEY_USAGE, true, ["decrypt"]);
}

export async function encryptPrivateKey(
  privateKeyB64: string,
  password: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), PBKDF2_ALGO, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    AES_ALGO,
    false,
    ["encrypt"],
  );
  const data = b642ab(privateKeyB64);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, data);
  return { ciphertext: ab2b64(encrypted), salt: ab2b64(salt.buffer), iv: ab2b64(iv.buffer) };
}

export async function decryptPrivateKey(
  ciphertextB64: string,
  password: string,
  saltB64: string,
  ivB64: string,
): Promise<string> {
  const salt = new Uint8Array(b642ab(saltB64));
  const iv = new Uint8Array(b642ab(ivB64));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), PBKDF2_ALGO, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    AES_ALGO,
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, b642ab(ciphertextB64));
  return ab2b64(decrypted);
}

export async function encryptMessage(
  content: string,
  publicKeys: Map<string, CryptoKey>,
): Promise<{ encryptedContent: string; contentIv: string; encryptedKeys: Record<string, string> }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.generateKey(AES_ALGO, true, ["encrypt"]);
  const encoded = new TextEncoder().encode(content);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);

  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeys: Record<string, string> = {};
  for (const [userId, pubKey] of publicKeys) {
    const enc = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawAesKey);
    encryptedKeys[userId] = ab2b64(enc);
  }

  return {
    encryptedContent: ab2b64(ciphertext),
    contentIv: ab2b64(iv.buffer),
    encryptedKeys,
  };
}

export async function decryptMessage(
  encryptedContentB64: string,
  contentIvB64: string,
  encryptedKeyB64: string,
  privateKey: CryptoKey,
): Promise<string> {
  const iv = new Uint8Array(b642ab(contentIvB64));
  const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, b642ab(encryptedKeyB64));
  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, AES_ALGO, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, b642ab(encryptedContentB64));
  return new TextDecoder().decode(decrypted);
}
