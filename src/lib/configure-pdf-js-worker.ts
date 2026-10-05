export function configurePdfJsWorker(pdfjs: typeof import("pdfjs-dist")): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}
