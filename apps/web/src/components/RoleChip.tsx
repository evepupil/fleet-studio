function RoleChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[18px] items-center whitespace-nowrap rounded-sm border border-line-strong px-1.5 text-11 text-fg-2">
      {label}
    </span>
  );
}

export { RoleChip };
