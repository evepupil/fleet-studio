import { Layers } from "lucide-react";
import { ViewBar } from "@/components/ViewBar";
import { AllDisabledNotice } from "@/features/slots/AllDisabledNotice";
import { SharedQueuePill } from "@/features/slots/SharedQueuePill";
import { SlotsTable } from "@/features/slots/SlotsTable";

/** 槽位页：视图栏（右侧公共排队）→ 全部停用提醒 → 通栏槽位表格。 */
function SlotsPage() {
  return (
    <>
      <ViewBar icon={Layers} title="槽位" documentTitle="槽位" right={<SharedQueuePill />} />
      <div data-page-body data-page="slots" className="min-h-0 flex-1 overflow-y-auto">
        <AllDisabledNotice />
        <SlotsTable />
      </div>
    </>
  );
}

export { SlotsPage };
