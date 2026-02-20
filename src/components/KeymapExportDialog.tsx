/**
 * KeymapExportDialog Component
 *
 * Shows generated ZMK .keymap file content in a popup dialog
 * with a button to copy the content to clipboard.
 */
import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconX, IconCopy, IconCheck } from "@tabler/icons-react";

interface KeymapExportDialogProps {
  open: boolean;
  onClose: () => void;
  content: string;
}

export function KeymapExportDialog({
  open,
  onClose,
  content,
}: KeymapExportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const handleCopy = useCallback(async () => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      try {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          setCopyError(true);
          setTimeout(() => setCopyError(false), 3000);
        }
      } catch {
        setCopyError(true);
        setTimeout(() => setCopyError(false), 3000);
      }
    }
  }, [content]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setCopied(false);
        setCopyError(false);
      }
    },
    [onClose],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl z-50 flex flex-col overflow-hidden max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <Dialog.Title className="text-lg font-medium text-[var(--color-text)]">
              Export Keymap
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                className={`btn-electric text-sm flex items-center gap-1.5 ${copyError ? "!bg-red-500/20 !text-red-400 !border-red-500/30" : ""}`}
                onClick={handleCopy}
              >
                {copyError ? (
                  <>
                    <IconX size={16} />
                    Copy failed
                  </>
                ) : copied ? (
                  <>
                    <IconCheck size={16} />
                    Copied!
                  </>
                ) : (
                  <>
                    <IconCopy size={16} />
                    Copy
                  </>
                )}
              </button>
              <Dialog.Close asChild>
                <button
                  className="p-2 rounded-lg hover:bg-[var(--color-border)] text-[var(--color-text-muted)]"
                  aria-label="Close"
                >
                  <IconX size={18} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              This is a partial keymap snippet. You will need to integrate it
              into your full ZMK config file.
            </p>
            <pre className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 overflow-auto whitespace-pre">
              {content}
            </pre>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
