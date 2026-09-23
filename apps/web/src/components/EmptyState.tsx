import styles from "./EmptyState.module.css";

const { root, message: messageClass, command: commandClass, action: actionClass } = styles;

export interface EmptyStateAction {
  label: string;
  onClick(): void;
}

export interface EmptyStateProps {
  message: string;
  command?: string;
  action?: EmptyStateAction;
}

/** 空态 / 错误态统一画法：区域居中的一句短句，最多再跟一行命令，不配插图。 */
export function EmptyState({ message, command, action }: EmptyStateProps) {
  return (
    <div className={root} data-empty>
      <p className={messageClass}>{message}</p>
      {command !== undefined && <p className={commandClass}>{command}</p>}
      {action !== undefined && (
        <button type="button" className={actionClass} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
