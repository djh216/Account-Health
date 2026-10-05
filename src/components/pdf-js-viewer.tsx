"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { configurePdfJsWorker } from "@/lib/configure-pdf-js-worker";

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => resolve(), { timeout: 80 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

export function PdfJsViewer({
  blobUrl,
  title,
  onFailed,
}: {
  blobUrl: string;
  title: string;
  onFailed?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onFailedRef = useRef(onFailed);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageCount, setPageCount] = useState(0);
  const [pagesRendered, setPagesRendered] = useState(0);

  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.replaceChildren();
    setStatus("loading");
    setPageCount(0);
    setPagesRendered(0);

    async function renderPreview() {
      try {
        const pdfjs = await import("pdfjs-dist");
        configurePdfJsWorker(pdfjs);

        const bytes = await fetch(blobUrl).then((response) => response.arrayBuffer());
        if (cancelled) return;

        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        const scale =
          typeof window !== "undefined" && window.devicePixelRatio > 1 ? 1.35 : 1.15;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          await yieldToMain();
          if (cancelled) return;

          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto block max-w-full bg-white shadow-sm";
          canvas.setAttribute("role", "img");
          canvas.setAttribute(
            "aria-label",
            `${title} — page ${pageNum} of ${pdf.numPages}`,
          );

          const wrapper = document.createElement("div");
          wrapper.className = "mb-4 flex justify-center last:mb-0";
          wrapper.appendChild(canvas);
          container!.appendChild(wrapper);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;

          if (pageNum === 1 && !cancelled) {
            setStatus("ready");
          }
          if (!cancelled) {
            setPagesRendered(pageNum);
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          onFailedRef.current?.();
        }
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [blobUrl, title]);

  if (status === "error") return null;

  const showScrollArea = status === "ready" || pagesRendered > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {status === "loading" ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading preview…
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={
          showScrollArea
            ? "min-h-0 flex-1 overflow-y-auto rounded-lg bg-muted/30 p-3 sm:p-4"
            : "sr-only"
        }
      />
      {pageCount > 0 ? (
        <p className="shrink-0 border-t bg-background px-3 py-1.5 text-center text-xs text-muted-foreground">
          {pagesRendered < pageCount
            ? `Rendering page ${pagesRendered} of ${pageCount}…`
            : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
        </p>
      ) : null}
    </div>
  );
}
