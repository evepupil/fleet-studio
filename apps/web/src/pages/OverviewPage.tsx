import { PageHeader } from "@/app/PageHeader";
import { LiveCards } from "@/features/overview/LiveCards";
import { RangeBar } from "@/features/overview/RangeBar";
import { StatCards } from "@/features/overview/StatCards";
import { StatsBody } from "@/features/overview/StatsBody";

export function OverviewPage() {
  return (
    <>
      <PageHeader title="总览" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div data-page="overview" className="flex min-w-0 flex-col gap-4 p-6">
          <LiveCards />
          <RangeBar />
          <StatCards />
          <StatsBody />
        </div>
      </main>
    </>
  );
}
