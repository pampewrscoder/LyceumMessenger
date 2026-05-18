import { useState, useCallback, useRef } from "react";
import { api } from "./api-client";
import type { UploadResult } from "./api-client";

interface UseUploadOptions {
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
}

export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      setIsUploading(true);
      setError(null);
      try {
        const result = await api.uploadFile(file);
        optionsRef.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Не удалось загрузить файл");
        setError(e);
        optionsRef.current.onError?.(e);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  return { uploadFile, isUploading, error };
}
