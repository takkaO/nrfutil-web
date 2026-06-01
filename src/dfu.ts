/**
 * Main DFU controller.
 *
 * Orchestrates the complete Adafruit nRF52 DFU process:
 * START → INIT → DATA (chunked) → STOP → ACTIVATE
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { DfuSerialTransport, SerialPortLike } from "./transport.js";
import { parseDfuPackage, DfuFirmwareImage } from "./package.js";
import {
  DfuTiming,
  DfuUpdateMode,
  DFU_PACKET_MAX_SIZE,
  FLASH_PAGE_SIZE,
  buildStartPacket,
  buildInitPacket,
  buildDataPacket,
  buildStopDataPacket,
  getEraseWaitTime,
  getActivateWaitTime,
} from "./dfu-protocol.js";

/** Progress callback */
export type ProgressCallback = (progress: {
  /** Bytes sent so far */
  sent: number;
  /** Total bytes to send */
  total: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Current operation description */
  message: string;
}) => void;

/** DFU options */
export interface DfuOptions {
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** ACK timeout in milliseconds (default: 5000) */
  ackTimeout?: number;
  /** Maximum retries per packet (default: 3) */
  maxRetries?: number;
  /** Single bank mode (default: true, matches adafruit-nrfutil --singlebank) */
  singleBank?: boolean;
}

/**
 * Perform DFU firmware update via WebSerial.
 *
 * This is the main entry point for the library.
 *
 * @param port - WebSerial port (already opened or will be opened)
 * @param zipData - DFU package ZIP as ArrayBuffer
 * @param options - Optional configuration
 *
 * @example
 * ```ts
 * const port = await navigator.serial.requestPort();
 * const zipData = await fetch("/firmware.zip").then(r => r.arrayBuffer());
 * await performDfu(port, zipData, {
 *   onProgress: ({ percent, message }) => {
 *     console.log(`${percent}% - ${message}`);
 *   },
 * });
 * ```
 */
export async function performDfu(
  port: SerialPortLike,
  zipData: ArrayBuffer,
  options: DfuOptions = {}
): Promise<void> {
  const { onProgress, ackTimeout, maxRetries, singleBank = true } = options;

  const report = (message: string, sent = 0, total = 0) => {
    const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
    onProgress?.({ sent, total, percent, message });
  };

  // Step 1: Parse the DFU package
  report("Parsing DFU package...");
  const images = await parseDfuPackage(zipData);

  // Step 2: Send each firmware image
  for (const image of images) {
    // Open transport for each image (matches Python behavior)
    report("Opening serial connection...");
    const transport = new DfuSerialTransport(port, { ackTimeout, maxRetries });
    await transport.open();

    try {
      await sendImage(transport, image, singleBank, report);
    } finally {
      await transport.close();
    }

    // Wait for activation (erase + copy)
    const activateWait = getActivateWaitTime(
      image.firmware.length,
      singleBank,
      image.softdeviceSize
    );
    report("Activating new firmware...");
    await sleep(activateWait);
  }

  report("DFU complete!");
}

/**
 * Trigger DFU mode by sending a 1200bps touch.
 *
 * Opens the port at 1200bps, waits briefly, then closes.
 * The device should reset into the bootloader.
 *
 * @param port - WebSerial port
 * @param waitTime - Time to wait after touch (default: 1500ms)
 */
export async function enterDfuMode(
  port: SerialPortLike,
  waitTime: number = DfuTiming.TOUCH_RESET_WAIT
): Promise<void> {
  await port.open({ baudRate: 1200 });
  await sleep(100); // Wait for port stable
  await port.close();
  await sleep(waitTime); // Wait for device to enter DFU mode
}

/**
 * Send a single firmware image through the DFU process.
 *
 * Protocol flow:
 *   1. START_PACKET → ACK → wait for flash erase
 *   2. INIT_PACKET  → ACK
 *   3. DATA_PACKET  → ACK  (repeated for each 512-byte chunk)
 *   4. STOP_DATA_PACKET → ACK
 */
async function sendImage(
  transport: DfuSerialTransport,
  image: DfuFirmwareImage,
  singleBank: boolean,
  report: (message: string, sent?: number, total?: number) => void
): Promise<void> {
  const totalSize = image.firmware.length;

  // 1. Send START_PACKET
  report("Sending start packet...", 0, totalSize);
  const startPayload = buildStartPacket(
    image.type,
    image.softdeviceSize,
    image.bootloaderSize,
    image.applicationSize
  );
  await transport.sendPacket(startPayload);

  // Wait for flash erase (depends on firmware size)
  const eraseWait = getEraseWaitTime(totalSize);
  report("Erasing flash...", 0, totalSize);
  await sleep(eraseWait);

  // 2. Send INIT_PACKET
  report("Sending init packet...", 0, totalSize);
  const initPayload = buildInitPacket(image.initPacket);
  await transport.sendPacket(initPayload);

  // 3. Send DATA_PACKETs
  report("Sending firmware data...", 0, totalSize);

  let bytesSent = 0;
  let packetCount = 0;

  for (let offset = 0; offset < totalSize; offset += DFU_PACKET_MAX_SIZE) {
    const end = Math.min(offset + DFU_PACKET_MAX_SIZE, totalSize);
    const chunk = image.firmware.subarray(offset, end);

    const dataPayload = buildDataPacket(chunk);
    await transport.sendPacket(dataPayload);

    bytesSent += chunk.length;
    packetCount++;

    report("Sending firmware data...", bytesSent, totalSize);

    // After every 8 packets (4096 bytes = 1 flash page), wait for flash write
    if (packetCount % 8 === 0) {
      await sleep(DfuTiming.FLASH_PAGE_WRITE_TIME * 1000);
    }
  }

  // Wait for last page to write
  await sleep(DfuTiming.FLASH_PAGE_WRITE_TIME * 1000);

  // 4. Send STOP_DATA_PACKET
  report("Finalizing...", totalSize, totalSize);
  const stopPayload = buildStopDataPacket();
  await transport.sendPacket(stopPayload);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}