"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ranked/");
  }, [router]);
  return (
    <div
      className="flex flex-col gap-2 py-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-full max-w-md" />
    </div>
  );
}
