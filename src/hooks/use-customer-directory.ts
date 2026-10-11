"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CustomerDirectory } from "@/lib/customer-directory";
import {
  clearCustomerDirectory,
  getCustomerDirectorySnapshot,
  getServerCustomerDirectorySnapshot,
  replaceCustomerDirectory,
  subscribeCustomerDirectory,
} from "@/lib/customer-store";

export function useCustomerDirectory() {
  const snapshot = useSyncExternalStore(
    subscribeCustomerDirectory,
    getCustomerDirectorySnapshot,
    getServerCustomerDirectorySnapshot,
  );

  const replace = useCallback((directory: CustomerDirectory) => {
    return replaceCustomerDirectory(directory);
  }, []);

  const clear = useCallback(() => {
    return clearCustomerDirectory();
  }, []);

  return {
    directory: snapshot.directory,
    hydrated: snapshot.hydrated,
    replace,
    clear,
  };
}
