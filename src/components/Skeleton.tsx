import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} />;
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="app-card col-span-2 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-[5.5rem]" />
              <Skeleton className="h-[4.6rem] w-[4.6rem] rounded-full" />
            </div>
          </div>
        </div>
        <div className="app-card p-4">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="mt-8 h-8 w-14" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <div className="app-card p-4">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="mt-8 h-8 w-10" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
        <div className="app-card col-span-2 p-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2 h-7 w-24" />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-card p-4">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="app-card px-3 py-4">
        <Skeleton className="mb-3 h-3.5 w-24" />
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-1">
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="app-card p-4">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-4 h-44 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="app-card overflow-hidden">
            <div className="px-4 py-3"><Skeleton className="h-3.5 w-28" /></div>
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className="flex items-center gap-3 border-t border-line/60 px-4 py-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
