import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

/**
 * Wrapper for RPC transport that allows reusing the connection
 * if ZMK Studio protocol negotiation fails
 */
export class ReusableRpcTransport implements RpcTransport {
  label: string;
  abortController: AbortController;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  private port: SerialPort | null = null;
  private isReleased = false;

  constructor(
    label: string,
    abortController: AbortController,
    readable: ReadableStream<Uint8Array>,
    writable: WritableStream<Uint8Array>,
    port?: SerialPort,
  ) {
    this.label = label;
    this.abortController = abortController;
    this.readable = readable;
    this.writable = writable;
    this.port = port ?? null;
  }

  /**
   * Release the transport for reuse without closing the underlying port
   * This allows the serial console to reuse the connection
   */
  release(): SerialPort | null {
    if (this.isReleased || !this.port) {
      return null;
    }

    this.isReleased = true;

    // Cancel the abort controller to stop ZMK protocol handling
    // but don't close the port
    try {
      this.abortController.abort();
    } catch {
      // Ignore errors
    }

    const releasedPort = this.port;
    this.port = null;
    return releasedPort;
  }

  /**
   * Check if this transport can be released
   */
  canRelease(): boolean {
    return !this.isReleased && this.port !== null;
  }
}

/**
 * Connect to a serial port with the ability to reuse the connection
 * if ZMK protocol negotiation fails
 */
export async function connectReusableSerial(): Promise<ReusableRpcTransport> {
  // Request serial port
  const port = await navigator.serial.requestPort();

  // Open the port
  await port.open({
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
  });

  if (!port.readable || !port.writable) {
    throw new Error("Port not readable or writable");
  }

  const abortController = new AbortController();

  return new ReusableRpcTransport(
    `Serial: ${port.getInfo().usbProductId}`,
    abortController,
    port.readable,
    port.writable,
    port,
  );
}

/**
 * Try to connect using ZMK Studio protocol with timeout
 * Returns { success: true, connection } if successful
 * Returns { success: false, port } if failed, with reusable port
 */
export async function tryZMKConnection(
  transport: ReusableRpcTransport,
  timeoutMs = 5000,
): Promise<
  | { success: true; transport: ReusableRpcTransport }
  | { success: false; port: SerialPort }
> {
  return new Promise((resolve) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    const handleTimeout = () => {
      if (resolved) return;
      resolved = true;

      // Timeout occurred - release the port for reuse
      const port = transport.release();
      if (port) {
        resolve({ success: false, port });
      } else {
        resolve({ success: false, port: null as unknown as SerialPort });
      }
    };

    const handleSuccess = () => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ success: true, transport });
    };

    // Set timeout
    timeoutId = setTimeout(handleTimeout, timeoutMs);

    // Try to read first response from device
    // This simulates the ZMK protocol handshake
    const reader = transport.readable.getReader();

    reader.read().then(
      (result) => {
        reader.releaseLock();
        if (!result.done) {
          handleSuccess();
        } else {
          handleTimeout();
        }
      },
      () => {
        reader.releaseLock();
        handleTimeout();
      },
    );
  });
}
