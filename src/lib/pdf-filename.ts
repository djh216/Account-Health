/** Filesystem-safe slug from a sales rep name or rep filter value. */
export function repSlugFromFilter(repFilter: string): string {
  if (repFilter === "all") return "all-reps";
  const slug = repFilter
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "rep";
}

/** Printable/export PDF names always lead with the rep slug for easy sorting. */
export function buildExportPdfFilename(
  repFilter: string,
  reportSlug: string,
  stamp: string,
): string {
  return `${repSlugFromFilter(repFilter)}-cellar-pulse-${reportSlug}-${stamp}.pdf`;
}

export function buildExportCsvFilename(
  repFilter: string,
  reportSlug: string,
  stamp: string,
): string {
  return `${repSlugFromFilter(repFilter)}-cellar-pulse-${reportSlug}-${stamp}.csv`;
}

export function buildExportXlsxFilename(
  repFilter: string,
  reportSlug: string,
  stamp: string,
): string {
  return `${repSlugFromFilter(repFilter)}-cellar-pulse-${reportSlug}-${stamp}.xlsx`;
}
