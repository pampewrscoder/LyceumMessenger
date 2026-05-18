import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { api } from "./api-client";
import type { Message } from "./api-client";
import * as e2ee from "./e2ee";

interface E2EEState {
  isReady: boolean;
  init: (password: string) => Promise<void>;
  getPublicKeyForUser: (userId: string) => Promise<CryptoKey>;
  encryptContent: (content: string, participantIds: string[]) => Promise<{
    encryptedContent: string;
    contentIv: string;
    encryptedKeys: Record<string, string>;
  }>;
  decryptMessageContent: (msg: Message) => Promise<string>;
}

const E2EEContext = createContext<E2EEState | null>(null);

export function E2EEProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [isReady, setIsReady] = useState(false);
  const passwordRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const publicKeyCache = useRef<Map<string, CryptoKey>>(new Map());

  useEffect(() => {
    if (!user) {
      setPrivateKey(null);
      setIsReady(false);
      initializedRef.current = false;
      publicKeyCache.current.clear();
    }
  }, [user?.id]);

  const performInit = useCallback(async (uid: string, pw: string) => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      const existing = await api.getMyKeys();
      if (existing) {
        const pkcs8 = await e2ee.decryptPrivateKey(existing.encryptedPrivateKey, pw, existing.keySalt, existing.keyIv);
        const key = await e2ee.pkcs8ToPrivateKey(pkcs8);
        setPrivateKey(key);
        setIsReady(true);
        return;
      }

      const pair = await e2ee.generateKeyPair();
      const publicPem = await e2ee.publicKeyToPem(pair.publicKey);
      const privateB64 = await e2ee.privateKeyToPKCS8(pair.privateKey);
      const enc = await e2ee.encryptPrivateKey(privateB64, pw);
      await api.saveKeys({ publicKey: publicPem, encryptedPrivateKey: enc.ciphertext, keySalt: enc.salt, keyIv: enc.iv });
      setPrivateKey(pair.privateKey);
      setIsReady(true);
    } catch (err) {
      console.error("E2EE init failed:", err);
      initializedRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (user && passwordRef.current) {
      performInit(user.id, passwordRef.current);
    }
  }, [user?.id, performInit]);

  const init = useCallback(async (password: string) => {
    passwordRef.current = password;
    if (user) {
      await performInit(user.id, password);
    }
  }, [user, performInit]);

  const getPublicKeyForUser = useCallback(async (targetUserId: string): Promise<CryptoKey> => {
    if (publicKeyCache.current.has(targetUserId)) {
      return publicKeyCache.current.get(targetUserId)!;
    }
    const resp = await api.getPublicKey(targetUserId);
    if (!resp) throw new Error("Пользователь не загрузил ключи шифрования");
    const key = await e2ee.pemToPublicKey(resp.publicKey);
    publicKeyCache.current.set(targetUserId, key);
    return key;
  }, []);

  const encryptContent = useCallback(async (content: string, participantIds: string[]) => {
    const pubKeys = new Map<string, CryptoKey>();
    for (const pid of participantIds) {
      const k = await getPublicKeyForUser(pid);
      pubKeys.set(pid, k);
    }
    return e2ee.encryptMessage(content, pubKeys);
  }, [getPublicKeyForUser]);

  const decryptMessageContent = useCallback(async (msg: Message): Promise<string> => {
    if (!msg.encryptedContent || !msg.contentIv || !msg.myEncryptedKey || !privateKey) {
      return msg.content || "";
    }
    return e2ee.decryptMessage(msg.encryptedContent, msg.contentIv, msg.myEncryptedKey, privateKey);
  }, [privateKey]);

  return (
    <E2EEContext.Provider value={{ isReady, init, getPublicKeyForUser, encryptContent, decryptMessageContent }}>
      {children}
    </E2EEContext.Provider>
  );
}

export function useE2EE(): E2EEState {
  const ctx = useContext(E2EEContext);
  if (!ctx) throw new Error("useE2EE must be used within E2EEProvider");
  return ctx;
}
