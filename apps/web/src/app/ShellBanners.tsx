import { Banner } from "@/components/Banner";
import { useSnapshotStore } from "@/state/snapshotStore";

function ShellBanners() {
  const connection = useSnapshotStore((state) => state.connection);
  const everOpened = useSnapshotStore((state) => state.everOpened);
  const configError = useSnapshotStore((state) => state.snapshot?.configError ?? null);
  const offline = connection === "lost" && everOpened;

  if (!offline && configError === null) return null;
  const configMessage =
    configError === null ? null : `配置文件有错，正在使用上一份有效配置：${configError}`;

  return (
    <div className="relative z-[var(--z-banner)] flex shrink-0 flex-col">
      {offline ? <Banner kind="offline">连接已断开，正在重连</Banner> : null}
      {configMessage !== null ? (
        <Banner kind="config" title={configMessage}>
          {configMessage}
        </Banner>
      ) : null}
    </div>
  );
}

export { ShellBanners };
