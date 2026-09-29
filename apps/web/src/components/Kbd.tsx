function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-sm border border-line bg-raised px-1 font-mono text-12 text-fg-3">
      {children}
    </kbd>
  );
}

export { Kbd };
