import type { jsPDF } from "jspdf";

export type PdfExportArtifact = {
  blobUrl: string;
  filename: string;
};

export function artifactFromJsPdf(doc: jsPDF, filename: string): PdfExportArtifact {
  const raw = doc.output("arraybuffer");
  const blob = new Blob([raw], { type: "application/pdf" });
  return {
    blobUrl: URL.createObjectURL(blob),
    filename,
  };
}

export function revokePdfArtifact(artifact: PdfExportArtifact | null | undefined): void {
  if (!artifact?.blobUrl) return;
  try {
    URL.revokeObjectURL(artifact.blobUrl);
  } catch {
    // ignore
  }
}

export function downloadPdfArtifact(artifact: PdfExportArtifact): void {
  const link = document.createElement("a");
  link.href = artifact.blobUrl;
  link.download = artifact.filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function printPdfArtifact(artifact: PdfExportArtifact): void {
  const popup = window.open(artifact.blobUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Pop-up blocked. Allow pop-ups to print, or use Download.");
  }
  popup.addEventListener("load", () => {
    popup.focus();
    popup.print();
  });
}
