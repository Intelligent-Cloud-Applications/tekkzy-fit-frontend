import { cn } from '@/lib/cn';

export function BrandWordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div
      className={cn(
        'font-brand font-semibold uppercase leading-none tracking-[0.16em]',
        size === 'lg' ? 'text-[2.1rem]' : 'text-[15px]',
      )}
    >
      Tekkzy <span className="text-accent">Fit</span>
    </div>
  );
}
