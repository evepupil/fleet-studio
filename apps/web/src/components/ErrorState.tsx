import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <section
      data-error
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
    >
      <TriangleAlert aria-hidden="true" className="size-4 text-status-warning" />
      <p className="text-13 text-fg-2">加载失败：{message}</p>
      {onRetry ? (
        <Button type="button" variant="link" size="sm" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </section>
  );
}

export { ErrorState };
