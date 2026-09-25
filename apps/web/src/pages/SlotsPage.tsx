import { PageHeader } from "@/app/PageHeader";
import { AllDisabledNotice } from "@/features/slots/AllDisabledNotice";
import { SharedQueuePill } from "@/features/slots/SharedQueuePill";
import { SlotsTable } from "@/features/slots/SlotsTable";

function SlotsPage() {
  return (
    <>
      <PageHeader title="槽位" right={<SharedQueuePill />} />
      <main data-page-body="slots" className="min-h-0 flex-1 overflow-y-auto">
        <div data-page="slots" className="flex min-w-0 flex-col gap-4 p-6">
          <AllDisabledNotice />
          <SlotsTable />
        </div>
      </main>
    </>
  );
}

export { SlotsPage };
