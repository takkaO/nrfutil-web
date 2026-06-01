/**
 * Serial transport for Nordic DFU.
 *
 * Handles the low-level serial communication: sending HCI packets
 * over SLIP, receiving and validating ACK responses, and managing
 * sequence numbers and retries.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { slipEncode } from "./slip.js";
import { SlipDecoder } from "./slip.js";
import { buildHciPacket, parseHciResponse } from "./hci.js";
import { DfuTiming } from "./dfu-protocol.js";

/** Interface for a serial port (compatible with WebSerial API) */
export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(signals: { dataTerminalReady?: boolean }): Promise<void>;
}

/** Transport configuration options */
export interface TransportOptions {
  /** ACK response timeout in milliseconds (default: 5000) */
  ackTimeout?: number;
  /** Maximum number of retries per packet (default: 3) */
  maxRetries?: number;
}

/**
 * Serial transport for DFU communication.
 *
 * Wraps a serial port and provides methods to send DFU payloads
 * as HCI packets over SLIP framing, with ACK verification and retries.
 */
export class DfuSerialTransport {
  private port: SerialPortLike;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private slipDecoder = new SlipDecoder();
  private sequenceNumber = 0;
  private ackTimeout: number;
  private maxRetries: number;

  /** Background reader state */
  private receivedData: number[] = [];
  private reading = false;
  private readLoopPromise: Promise<void> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  constructor(port: SerialPortLike, options: TransportOptions = {}) {
    this.port = port;
    this.ackTimeout = options.ackTimeout ?? DfuTiming.ACK_TIMEOUT;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Open the serial port, toggle DTR, and start background reading.
   */
  async open(baudRate: number = 115200): Promise<void> {
    await this.port.open({ baudRate });

    if (!this.port.readable || !this.port.writable) {
      throw new Error("Serial port is not readable/writable after open");
    }

    // Short delay for port stabilization
    await this.sleep(100);

    // DTR toggle to reset device into DFU mode
    if (this.port.setSignals) {
      try {
        await this.port.setSignals({ dataTerminalReady: false });
        await this.sleep(50);
        await this.port.setSignals({ dataTerminalReady: true });
        await this.sleep(DfuTiming.DTR_RESET_WAIT);
      } catch {
        // Some devices don't support DTR — continue anyway
      }
    }

    this.writer = this.port.writable.getWriter();
    this.sequenceNumber = 0;
    this.receivedData = [];
    this.slipDecoder.reset();

    // Start background reading
    this.startReading();
  }

  /**
   * Close the serial port and stop background reading.
   */
  async close(): Promise<void> {
    await this.stopReading();

    try {
      this.writer?.releaseLock();
    } catch {
      // Ignore
    }
    this.writer = null;

    await this.port.close();
  }

  /**
   * Send a DFU payload and wait for ACK.
   *
   * Wraps the payload in an HCI packet, SLIP-encodes it,
   * sends it over serial, and waits for a valid ACK response.
   * Retries up to maxRetries times on failure.
   *
   * @param payload - DFU command payload
   * @returns The decoded response payload (inside the ACK HCI packet)
   * @throws Error if all retries are exhausted
   */
  async sendPacket(payload: Uint8Array): Promise<Uint8Array> {
    if (!this.writer) {
      throw new Error("Transport is not open");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Advance sequence number
        this.sequenceNumber = (this.sequenceNumber + 1) % 8;

        // Build HCI packet
        const hciPacket = buildHciPacket(this.sequenceNumber, payload);

        // SLIP-encode and send
        const slipFrame = slipEncode(hciPacket);

        // Clear receive buffer before sending
        this.receivedData = [];

        await this.writer.write(slipFrame);

        // Short delay for device processing
        await this.sleep(10);

        // Wait for ACK
        const response = await this.waitForAck();

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          this.slipDecoder.reset();
          this.receivedData = [];
          await this.sleep(100);
        }
      }
    }

    throw new Error(
      `Failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Send raw data without HCI wrapping (used for firmware data chunks).
   *
   * @param data - Raw data to send
   */
  async sendData(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error("Transport is not open");
    }

    const slipFrame = slipEncode(data);
    await this.writer.write(slipFrame);
  }

  /**
   * Start background reading from the serial port.
   * Continuously reads bytes and stores them in receivedData.
   */
  private startReading(): void {
    if (this.reading || !this.port.readable) return;

    this.reading = true;
    this.reader = this.port.readable.getReader();

    this.readLoopPromise = (async () => {
      try {
        while (this.reading) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          if (value) {
            this.receivedData.push(...Array.from(value));
          }
        }
      } catch {
        // Read error (e.g., device disconnected) — stop silently
      } finally {
        this.reading = false;
        try {
          this.reader?.releaseLock();
        } catch {
          // Ignore
        }
        this.reader = null;
      }
    })();
  }

  /**
   * Stop the background reader.
   */
  private async stopReading(): Promise<void> {
    if (!this.reading) return;

    this.reading = false;

    try {
      await this.reader?.cancel();
    } catch {
      // Ignore
    }

    await this.readLoopPromise;
    this.readLoopPromise = null;
  }

  /**
   * Wait for an ACK response from the device.
   *
   * Polls the receivedData buffer for a complete SLIP frame
   * (two SLIP_END markers), then decodes and validates it.
   */
  private async waitForAck(): Promise<Uint8Array> {
    const SLIP_END = 0xc0;
    const deadline = Date.now() + this.ackTimeout;

    // Wait until we have at least 2 SLIP_END markers in the buffer
    while (Date.now() < deadline) {
      const endCount = this.receivedData.filter((b) => b === SLIP_END).length;
      if (endCount >= 2) break;
      await this.sleep(10);
    }

    if (this.receivedData.filter((b) => b === SLIP_END).length < 2) {
      throw new Error("ACK timeout");
    }

    // Decode the SLIP frame
    const rawData = new Uint8Array(this.receivedData);
    const frames = this.slipDecoder.feed(rawData);
    this.receivedData = [];

    for (const frame of frames) {
      const hciResponse = parseHciResponse(frame);
      if (!hciResponse) continue;

      // Extract payload (skip 4-byte header, strip 2-byte CRC)
      if (frame.length > 6) {
        return frame.subarray(4, frame.length - 2);
      }
      return new Uint8Array([]);
    }

    throw new Error("No valid ACK in received data");
  }

  /**
   * Get the current sequence number (for testing/debugging).
   */
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}