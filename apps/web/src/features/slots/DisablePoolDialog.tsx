import type { PoolView } from "@fleet/core";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DisablePoolDialogProps {
  /** 为 null 时关闭 */
  pool: PoolView | null;
  onCancel(): void;
  onConfirm(): void;
  pending: boolean;
  error: string | null;
}

/** 停用前按两个数拼一句人话：还在跑的说会跑完，排队的说会一直等。 */
function describe(pool: PoolView): string | null {
  const parts: string[] = [];
  if (pool.running > 0) {
    parts.push(`还有 ${pool.running} 个在跑，会跑完`);
  }
  if (pool.queued > 0) {
    parts.push(`点名它的 ${pool.queued} 个任务会一直排队到重新启用`);
  }
  return parts.length === 0 ? null : parts.join("；");
}

/**
 * L5 停用确认框：只负责画和回报，开关状态由 SlotsTable 拿着。
 * 请求进行中时不许关（Esc 和取消都挡住），失败时留在框里显示原因。
 */
function DisablePoolDialog({ pool, onCancel, onConfirm, pending, error }: DisablePoolDialogProps) {
  const message = pool === null ? null : describe(pool);

  return (
    <AlertDialog
      open={pool !== null}
      onOpenChange={(open) => {
        // Esc 也会走这里；pending 时忽略关闭请求，等请求落地再决定去留。
        if (!open && !pending) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent
        data-disable-dialog
        className="w-[400px] max-w-[400px] rounded-lg bg-overlay data-[size=default]:sm:max-w-[400px]"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-14 font-semibold">
            {pool === null ? "" : `停用 ${pool.id}？`}
          </AlertDialogTitle>
          {message === null ? null : (
            // 颜色放里层：外层的内建类里有 `text-muted-foreground`，和 `text-fg-2` 撞同一个 twMerge 组。
            <AlertDialogDescription className="text-13">
              <span className="text-fg-2">{message}</span>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {error === null ? null : <div className="text-12 text-status-failed">{error}</div>}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <Button
            type="button"
            data-confirm-disable
            disabled={pending}
            onClick={onConfirm}
            className="bg-status-failed text-on-brand hover:brightness-110"
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin-slow" />
            ) : null}
            停用
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { DisablePoolDialog };
