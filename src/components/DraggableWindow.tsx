import { useState, useRef, useEffect, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IconX, IconMaximize, IconMinimize } from "@tabler/icons-react";

interface DraggableWindowProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
}

export function DraggableWindow({
  open,
  onClose,
  title,
  children,
  defaultPosition = { x: 100, y: 100 },
  defaultSize = { width: 600, height: 400 },
}: DraggableWindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ width: 0, height: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".window-header")) {
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartPos.current = { x: e.clientX, y: e.clientY };
    resizeStartSize.current = { ...size };
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isMaximized) {
        setPosition({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y,
        });
      } else if (isResizing && !isMaximized) {
        const newWidth = Math.max(
          300,
          resizeStartSize.current.width + (e.clientX - resizeStartPos.current.x),
        );
        const newHeight = Math.max(
          200,
          resizeStartSize.current.height + (e.clientY - resizeStartPos.current.y),
        );
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, isResizing, isMaximized]);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-40" />
        <Dialog.Content
          ref={windowRef}
          className="fixed z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xl flex flex-col overflow-hidden"
          style={
            isMaximized
              ? {
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  width: "100vw",
                  height: "100vh",
                  transform: "none",
                }
              : {
                  top: position.y,
                  left: position.x,
                  width: size.width,
                  height: size.height,
                }
          }
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby="window-content"
        >
          {/* Window Header */}
          <div
            className="window-header flex items-center justify-between px-4 py-2 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border)] cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            <Dialog.Title className="text-sm font-medium text-[var(--color-text)]">
              {title}
            </Dialog.Title>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleMaximize}
                className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                aria-label={isMaximized ? "Restore" : "Maximize"}
              >
                {isMaximized ? (
                  <IconMinimize size={16} />
                ) : (
                  <IconMaximize size={16} />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-500"
                aria-label="Close"
              >
                <IconX size={16} />
              </button>
            </div>
          </div>

          {/* Window Content */}
          <div id="window-content" className="flex-1 overflow-auto">{children}</div>

          {/* Resize Handle */}
          {!isMaximized && (
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              onMouseDown={handleResizeMouseDown}
            >
              <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-[var(--color-border)]" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
