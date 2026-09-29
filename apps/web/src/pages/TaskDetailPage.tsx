import { ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { CopyButton } from "@/components/CopyButton";
import { ViewBar } from "@/components/ViewBar";
import { WorkerDetail } from "@/features/worker/WorkerDetail";
import { tasksPath, useViewStore } from "@/state/viewStore";

export function TaskDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const lastTasksView = useViewStore((state) => state.lastTasksView);

  const goBack = useCallback(() => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(tasksPath(lastTasksView));
    }
  }, [location.key, navigate, lastTasksView]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        ) !== null
      ) {
        return;
      }
      const focusedElement = document.activeElement;
      if (
        focusedElement instanceof HTMLElement &&
        (focusedElement.isContentEditable || focusedElement.matches("input, textarea, select"))
      ) {
        return;
      }
      // 弹层和编辑控件优先消费 Escape，只有页面本身获得按键时才执行回退。
      goBack();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack]);

  return (
    <>
      <ViewBar
        documentTitle={`任务 ${id}`}
        title={
          <>
            <button
              type="button"
              data-detail-back
              onClick={goBack}
              className="rounded-sm text-fg-2 transition-colors hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              任务
            </button>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-3" />
            <span data-detail-crumb className="truncate font-mono text-fg-1">
              {id}
            </span>
          </>
        }
        right={
          <span data-copy-id>
            <CopyButton text={id} label="复制编号" />
          </span>
        }
      />
      <div data-page-body className="flex min-h-0 flex-1">
        <WorkerDetail id={id} onBack={goBack} />
      </div>
    </>
  );
}
