import { isSnapshotLastVisitRecord } from "./visit-index";
import { ensureUploadLastVisitIndex } from "./upload-last-visits";
import type { PortfolioState } from "./types";

export type ClearUploadScope = "orders" | "activity";

export function activityVisitCount(state: PortfolioState): number {
  return state.visits.filter((visit) => !isSnapshotLastVisitRecord(visit)).length;
}

export function clearPortfolioUpload(
  state: PortfolioState,
  scope: ClearUploadScope,
): PortfolioState {
  const analysisAsOf = new Date().toISOString().slice(0, 10);

  if (scope === "orders") {
    return {
      ...state,
      orders: [],
      reports: state.reports.filter((report) => report.kind !== "orders"),
      analysisAsOf,
    };
  }

  const visits = state.visits.filter(isSnapshotLastVisitRecord);
  const partial: PortfolioState = {
    ...state,
    visits,
    reports: state.reports.filter((report) => report.kind !== "visits"),
    uploadLastVisitIndex: {},
    analysisAsOf,
  };
  return {
    ...partial,
    uploadLastVisitIndex: ensureUploadLastVisitIndex(partial),
  };
}
