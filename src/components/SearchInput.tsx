import { Search } from 'lucide-react';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-line bg-[var(--input-bg)] pl-9 pr-3 text-[13px] text-ink outline-none transition placeholder:text-ink-soft focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
      />
    </label>
  );
}
