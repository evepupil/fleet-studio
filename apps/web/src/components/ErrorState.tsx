import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      data-error
      role="alert"
      className="flex flex-col items-center justify-center gap-2 py-12 text-center"
    >
      <TriangleAlert aria-hidden="true" className="size-5 text-status-warning" />
      <p className="text-13 text-fg-2">加载失败：{message}</p>
      {onRetry ? (
        <Button type="button" variant="link" onClick={onRetry} className="text-brand">
          重试
        </Button>
      ) : null}
    </div>
  );
}

export { ErrorState };
