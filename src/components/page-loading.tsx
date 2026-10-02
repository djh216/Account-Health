export function DashboardPageLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-[96rem] flex-col items-center justify-center gap-3 px-4 py-12 text-muted-foreground">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm">Loading {label}…</p>
    </div>
  );
}
