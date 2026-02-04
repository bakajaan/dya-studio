import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraggableWindow } from "../DraggableWindow";

describe("DraggableWindow", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders when open", () => {
    render(
      <DraggableWindow open={true} onClose={mockOnClose} title="Test Window">
        <div>Window Content</div>
      </DraggableWindow>,
    );

    expect(screen.getByText("Test Window")).toBeInTheDocument();
    expect(screen.getByText("Window Content")).toBeInTheDocument();
  });

  test("does not render when closed", () => {
    render(
      <DraggableWindow open={false} onClose={mockOnClose} title="Test Window">
        <div>Window Content</div>
      </DraggableWindow>,
    );

    expect(screen.queryByText("Test Window")).not.toBeInTheDocument();
    expect(screen.queryByText("Window Content")).not.toBeInTheDocument();
  });

  test("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DraggableWindow open={true} onClose={mockOnClose} title="Test Window">
        <div>Window Content</div>
      </DraggableWindow>,
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test("has maximize button", () => {
    render(
      <DraggableWindow open={true} onClose={mockOnClose} title="Test Window">
        <div>Window Content</div>
      </DraggableWindow>,
    );

    const maximizeButton = screen.getByRole("button", { name: /maximize/i });
    expect(maximizeButton).toBeInTheDocument();
  });

  test("toggles maximize state", async () => {
    const user = userEvent.setup();
    render(
      <DraggableWindow open={true} onClose={mockOnClose} title="Test Window">
        <div>Window Content</div>
      </DraggableWindow>,
    );

    const maximizeButton = screen.getByRole("button", { name: /maximize/i });
    await user.click(maximizeButton);

    // After clicking, should show "Restore" button
    const restoreButton = screen.getByRole("button", { name: /restore/i });
    expect(restoreButton).toBeInTheDocument();
  });

  test("renders children content", () => {
    render(
      <DraggableWindow open={true} onClose={mockOnClose} title="Test Window">
        <div data-testid="test-content">Custom Content Here</div>
      </DraggableWindow>,
    );

    expect(screen.getByTestId("test-content")).toBeInTheDocument();
    expect(screen.getByText("Custom Content Here")).toBeInTheDocument();
  });

  test("displays title in header", () => {
    render(
      <DraggableWindow
        open={true}
        onClose={mockOnClose}
        title="My Custom Title"
      >
        <div>Content</div>
      </DraggableWindow>,
    );

    expect(screen.getByText("My Custom Title")).toBeInTheDocument();
  });
});
