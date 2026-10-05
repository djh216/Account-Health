"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CLOSED_BUSINESS_CHANGE_EVENT,
  closedBusinessAccountId,
  markAccountClosedBusiness,
  readClosedBusinessAccounts,
  restoreClosedBusinessAccount,
  type ClosedBusinessAccount,
} from "@/lib/closed-business-accounts";

export function useClosedBusinessAccounts() {
  const [marks, setMarks] = useState<ClosedBusinessAccount[]>([]);

  useEffect(() => {
    const sync = () => setMarks(readClosedBusinessAccounts());
    sync();
    window.addEventListener(CLOSED_BUSINESS_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CLOSED_BUSINESS_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const ids = useMemo(() => new Set(marks.map((mark) => mark.id)), [marks]);

  const mark = useCallback((account: { id?: string; accountName: string }) => {
    markAccountClosedBusiness({
      id: account.id ?? closedBusinessAccountId(account.accountName),
      accountName: account.accountName,
    });
  }, []);

  const restore = useCallback((id: string) => {
    restoreClosedBusinessAccount(id);
  }, []);

  return { marks, ids, mark, restore };
}
