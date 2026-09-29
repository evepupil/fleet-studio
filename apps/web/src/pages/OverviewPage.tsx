import { LayoutDashboard } from "lucide-react";
import { ViewBar } from "@/components/ViewBar";
import { LiveCards } from "@/features/overview/LiveCards";
import { RangeBar } from "@/features/overview/RangeBar";
import { StatCards } from "@/features/overview/StatCards";
import { StatsBody } from "@/features/overview/StatsBody";

function OverviewPage() {
  return (
    <>
      <ViewBar icon={LayoutDashboard} title="总览" documentTitle="总览" right={<RangeBar />} />
      <div data-page-body className="min-h-0 flex-1 overflow-y-auto">
        <div data-page="overview" className="flex min-w-0 flex-col gap-4 p-4 max-md:p-3">
          <LiveCards />
          <StatCards />
          <StatsBody />
        </div>
      </div>
    </>
  );
}

export { OverviewPage };
