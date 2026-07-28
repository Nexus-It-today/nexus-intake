"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "@/components/platform/PlatformProvider";
import { authedFetch } from "./clientApi";

export function useAuthedResource<T>(url: string | null) {
  const { accessToken } = usePlatform();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url || !accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await authedFetch<T>(accessToken, url);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [url, accessToken]);

  useEffect(() => {
    // Standard fetch-on-mount/dependency-change pattern: reload() itself sets
    // loading/data/error state after an async request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
