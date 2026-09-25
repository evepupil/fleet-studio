import { Unplug } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { reconnectSnapshot, useSnapshotStore } from "@/state/snapshotStore";

function ConnectionGate({ children }: { children: ReactNode }) {
  const connection = useSnapshotStore((state) => state.connection);
  const everOpened = useSnapshotStore((state) => state.everOpened);

  if (!everOpened && connection === "lost") {
    return (
      <div data-connection-gate className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Unplug}
          message="连不上 fleet 服务"
          command="fleet daemon start"
          action={{ label: "重试", onClick: reconnectSnapshot }}
        />
      </div>
    );
  }
  return children;
}

export { ConnectionGate };
