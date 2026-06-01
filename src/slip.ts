/**
 * SLIP (Serial Line Internet Protocol) encoder/decoder for Nordic DFU.
 *
 * RFC 1055 based framing with Nordic DFU HCI packet header.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** SLIP special byte values */
const SLIP_BYTE_END = 0xc0;
const SLIP_BYTE_ESC = 0xdb;
const SLIP_BYTE_ESC_END = 0xdc;
const SLIP_BYTE_ESC_ESC = 0xdd;

/**
 * SLIP-encode a data payload.
 * Wraps data between END bytes, escaping any END or ESC bytes in the payload.
 *
 * @param data - Raw data to encode
 * @returns SLIP-encoded frame
 */
export function slipEncode(data: Uint8Array): Uint8Array {
  const encoded: number[] = [SLIP_BYTE_END];

  for (const byte of data) {
    if (byte === SLIP_BYTE_END) {
      encoded.push(SLIP_BYTE_ESC, SLIP_BYTE_ESC_END);
    } else if (byte === SLIP_BYTE_ESC) {
      encoded.push(SLIP_BYTE_ESC, SLIP_BYTE_ESC_ESC);
    } else {
      encoded.push(byte);
    }
  }

  encoded.push(SLIP_BYTE_END);
  return new Uint8Array(encoded);
}

/**
 * SLIP-decode a frame.
 * Strips END bytes and unescapes ESC sequences.
 *
 * @param data - SLIP-encoded frame
 * @returns Decoded data, or null if the frame is incomplete/invalid
 */
export function slipDecode(data: Uint8Array): Uint8Array | null {
  // Find frame boundaries
  const start = data.indexOf(SLIP_BYTE_END);
  if (start === -1) return null;

  // Find the end of the frame (next END after start)
  let end = -1;
  for (let i = start + 1; i < data.length; i++) {
    if (data[i] === SLIP_BYTE_END) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  // Decode the payload between the two END markers
  const decoded: number[] = [];
  let escaped = false;

  for (let i = start + 1; i < end; i++) {
    const byte = data[i];

    if (escaped) {
      if (byte === SLIP_BYTE_ESC_END) {
        decoded.push(SLIP_BYTE_END);
      } else if (byte === SLIP_BYTE_ESC_ESC) {
        decoded.push(SLIP_BYTE_ESC);
      } else {
        // Invalid escape sequence — protocol error
        return null;
      }
      escaped = false;
    } else if (byte === SLIP_BYTE_ESC) {
      escaped = true;
    } else {
      decoded.push(byte);
    }
  }

  // Incomplete escape at end of frame
  if (escaped) return null;

  return new Uint8Array(decoded);
}

/**
 * Accumulator for receiving SLIP frames from a stream.
 * Buffers incoming bytes and emits complete decoded frames.
 */
export class SlipDecoder {
  private buffer: number[] = [];
  private inFrame = false;

  /**
   * Feed incoming bytes into the decoder.
   *
   * @param data - Incoming bytes from serial port
   * @returns Array of decoded frames (may be empty)
   */
  feed(data: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];

    for (const byte of data) {
      if (byte === SLIP_BYTE_END) {
        if (this.inFrame && this.buffer.length > 0) {
          const decoded = slipDecode(
            new Uint8Array([SLIP_BYTE_END, ...this.buffer, SLIP_BYTE_END])
          );
          if (decoded && decoded.length > 0) {
            frames.push(decoded);
          }
        }
        this.buffer = [];
        this.inFrame = true;
      } else if (this.inFrame) {
        this.buffer.push(byte);
      }
    }

    return frames;
  }

  /** Reset the decoder state. */
  reset(): void {
    this.buffer = [];
    this.inFrame = false;
  }
}