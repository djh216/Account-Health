"use client";

import { createContext, useContext, type ReactNode } from "react";
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog";
import {
  useReportExportController,
  type ReportExportController,
} from "@/hooks/use-report-export";

const ReportExportContext = createContext<ReportExportController | null>(null);

export function ReportExportProvider({ children }: { children: ReactNode }) {
  const value = useReportExportController();

  return (
    <ReportExportContext.Provider value={value}>
      {children}
      <PdfPreviewDialog
        open={value.pdfPreview !== null}
        title={value.pdfPreview?.title ?? "Report preview"}
        artifact={value.pdfPreview?.artifact ?? null}
        onOpenChange={(open) => {
          if (!open) value.closePdfPreview();
        }}
      />
    </ReportExportContext.Provider>
  );
}

export type { ReportPageType } from "@/hooks/use-report-export";

export function useReportExport(): ReportExportController {
  const context = useContext(ReportExportContext);
  if (!context) {
    throw new Error("useReportExport must be used within ReportExportProvider");
  }
  return context;
}
