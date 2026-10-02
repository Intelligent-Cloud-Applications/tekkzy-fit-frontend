export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex items-center gap-2.5 text-[13px] text-ink-soft">
        <span className="tf-btn-loader" />
        {label}
      </div>
    </div>
  );
}
