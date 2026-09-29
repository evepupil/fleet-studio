import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const toasterStyle: CSSProperties &
  Record<"--normal-bg" | "--normal-text" | "--normal-border" | "--border-radius", string> = {
  "--normal-bg": "var(--bg-overlay)",
  "--normal-text": "var(--text-1)",
  "--normal-border": "var(--line)",
  "--border-radius": "var(--r-card)",
};

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster"
      toastOptions={{
        className: "rounded-lg border border-line bg-overlay text-12 text-fg-1 shadow-overlay",
      }}
      style={toasterStyle}
      {...props}
    />
  );
}

export { Toaster };
