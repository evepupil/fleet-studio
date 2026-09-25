import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster"
      style={
        {
          "--normal-bg": "var(--bg-overlay)",
          "--normal-text": "var(--text-1)",
          "--normal-border": "var(--line)",
          "--border-radius": "var(--r-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
