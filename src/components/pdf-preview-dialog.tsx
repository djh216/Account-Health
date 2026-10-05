"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, Printer, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfJsViewer } from "@/components/pdf-js-viewer";
import { downloadPdfArtifact, printPdfArtifact, type PdfExportArtifact } from "@/lib/pdf-present";

function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function PdfPreviewDialog({
  open,
  title,
  artifact,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  artifact: PdfExportArtifact | null;
  onOpenChange: (open: boolean) => void;
}) {
  const isClient = useIsClient();
  const [previewFailedForUrl, setPreviewFailedForUrl] = useState<string | null>(null);
  const canvasPreviewFailed =
    artifact !== null && previewFailedForUrl === artifact.blobUrl;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!isClient || !open || !artifact) return null;

  function close() {
    onOpenChange(false);
  }

  function handlePrint() {
    try {
      printPdfArtifact(artifact!);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not open print dialog.");
    }
  }

  function handleDownload() {
    downloadPdfArtifact(artifact!);
  }

  function handleOpenInTab() {
    window.open(artifact!.blobUrl, "_blank", "noopener,noreferrer");
  }

  const content = (
    <div
      className="fixed inset-0 z-[200] flex h-dvh max-h-dvh flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id="pdf-preview-title" className="font-heading truncate text-lg font-medium">
            {title}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{artifact.filename}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleOpenInTab}>
            <ExternalLink data-icon="inline-start" className="size-4" />
            Open in tab
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
            <Printer data-icon="inline-start" className="size-4" />
            Print
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleDownload}>
            <Download data-icon="inline-start" className="size-4" />
            Save PDF
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
            <XIcon className="size-4" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-muted/40 p-2 sm:p-4">
        <div className="flex h-full min-h-[50vh] flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
          {canvasPreviewFailed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                Preview could not render in this panel. Open the report in a new tab, or save the
                PDF file.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="default" size="sm" onClick={handleOpenInTab}>
                  <ExternalLink data-icon="inline-start" className="size-4" />
                  Open in tab
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                  <Download data-icon="inline-start" className="size-4" />
                  Save PDF
                </Button>
              </div>
            </div>
          ) : (
            <PdfJsViewer
              key={artifact.blobUrl}
              blobUrl={artifact.blobUrl}
              title={title}
              onFailed={() => setPreviewFailedForUrl(artifact.blobUrl)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
