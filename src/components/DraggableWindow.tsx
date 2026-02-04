import { useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode } from "react";

export interface WindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DraggableWindowProps {
  children: ReactNode;
  initialPosition?: Partial<WindowPosition>;
  onPositionChange?: (position: WindowPosition) => void;
  onDragStart?: () => void;
  onDragEnd?: (position: WindowPosition) => void;
  zIndex?: number;
  onFocus?: () => void;
}

export function DraggableWindow({
  children,
  initialPosition = {},
  onPositionChange,
  onDragStart,
  onDragEnd,
  zIndex = 1000,
  onFocus,
}: DraggableWindowProps) {
  const [position, setPosition] = useState<WindowPosition>({
    x: initialPosition.x ?? 100,
    y: initialPosition.y ?? 100,
    width: initialPosition.width ?? 600,
    height: initialPosition.height ?? 400,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>("");

  const dragStartPos = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);
  const resizeStartPos = useRef<WindowPosition>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".window-content")) {
        return; // Don't drag when interacting with content
      }

      e.preventDefault();
      setIsDragging(true);
      dragStartPos.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      onDragStart?.();
      onFocus?.();
    },
    [position.x, position.y, onDragStart, onFocus],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, direction: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeDirection(direction);
      resizeStartPos.current = {
        x: e.clientX,
        y: e.clientY,
        width: position.width,
        height: position.height,
      };
      onFocus?.();
    },
    [position.width, position.height, onFocus],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newPosition = {
          ...position,
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y,
        };
        setPosition(newPosition);
        onPositionChange?.(newPosition);
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStartPos.current.x;
        const deltaY = e.clientY - resizeStartPos.current.y;

        let newWidth = position.width;
        let newHeight = position.height;
        let newX = position.x;
        let newY = position.y;

        if (resizeDirection.includes("e")) {
          newWidth = Math.max(300, resizeStartPos.current.width + deltaX);
        }
        if (resizeDirection.includes("s")) {
          newHeight = Math.max(200, resizeStartPos.current.height + deltaY);
        }
        if (resizeDirection.includes("w")) {
          const widthDelta = resizeStartPos.current.width - deltaX;
          newWidth = Math.max(300, widthDelta);
          newX = position.x + (resizeStartPos.current.width - newWidth);
        }
        if (resizeDirection.includes("n")) {
          const heightDelta = resizeStartPos.current.height - deltaY;
          newHeight = Math.max(200, heightDelta);
          newY = position.y + (resizeStartPos.current.height - newHeight);
        }

        const newPosition = {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        };
        setPosition(newPosition);
        onPositionChange?.(newPosition);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        onDragEnd?.(position);
      }
      if (isResizing) {
        setIsResizing(false);
        setResizeDirection("");
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [
    isDragging,
    isResizing,
    position,
    resizeDirection,
    onPositionChange,
    onDragEnd,
  ]);

  return (
    <div
      ref={windowRef}
      className="absolute shadow-2xl rounded-lg overflow-hidden"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        zIndex,
        cursor: isDragging ? "move" : "default",
      }}
      onClick={onFocus}
    >
      {/* Window Header (draggable) */}
      <div
        onMouseDown={handleMouseDown}
        className="cursor-move select-none"
        style={{ touchAction: "none" }}
      >
        <div className="window-content">{children}</div>
      </div>

      {/* Resize handles */}
      {!isDragging && (
        <>
          {/* Corner handles */}
          <div
            className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "nw")}
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "ne")}
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "sw")}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "se")}
          />

          {/* Edge handles */}
          <div
            className="absolute top-0 left-3 right-3 h-1 cursor-n-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "n")}
          />
          <div
            className="absolute bottom-0 left-3 right-3 h-1 cursor-s-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "s")}
          />
          <div
            className="absolute left-0 top-3 bottom-3 w-1 cursor-w-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "w")}
          />
          <div
            className="absolute right-0 top-3 bottom-3 w-1 cursor-e-resize"
            onMouseDown={(e) => handleResizeMouseDown(e, "e")}
          />
        </>
      )}
    </div>
  );
}
