import { Skeleton, SkeletonCards } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3.5 w-[420px] max-w-full" />
      </div>
      <SkeletonCards count={4} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="surface-card xl:col-span-2">
          <div className="border-b border-border/60 px-5 py-3.5">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="surface-card">
          <div className="border-b border-border/60 px-5 py-3.5">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
