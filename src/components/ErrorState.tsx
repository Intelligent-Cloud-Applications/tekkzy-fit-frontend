export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-bad/30 bg-bad-bg px-4 py-3 text-[13px] text-bad">
      <div>{message}</div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-2 text-[12px] font-semibold underline">
          Try again
        </button>
      ) : null}
    </div>
  );
}
