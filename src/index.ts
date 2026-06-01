/**
 * nrfutil-web — WebSerial implementation of nrfutil DFU for nRF52 devices.
 *
 * @example
 * ```ts
 * import { performDfu, enterDfuMode } from "nrfutil-web";
 *
 * // Enter DFU mode (1200bps touch)
 * const port = await navigator.serial.requestPort();
 * await enterDfuMode(port);
 *
 * // Wait for device to re-enumerate, then request port again
 * const dfuPort = await navigator.serial.requestPort();
 *
 * // Perform DFU
 * const zipData = await fetch("/firmware.zip").then(r => r.arrayBuffer());
 * await performDfu(dfuPort, zipData, {
 *   onProgress: ({ percent, message }) => {
 *     console.log(`${percent}% - ${message}`);
 *   },
 * });
 * ```
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Main API
export { performDfu, enterDfuMode } from "./dfu.js";
export type { DfuOptions, ProgressCallback } from "./dfu.js";

// Transport (for advanced usage)
export { DfuSerialTransport } from "./transport.js";
export type { SerialPortLike, TransportOptions } from "./transport.js";

// Package parser (for advanced usage)
export { parseDfuPackage } from "./package.js";
export type { DfuFirmwareImage } from "./package.js";

// Protocol constants (for advanced usage)
export {
  DfuCommand,
  DfuUpdateMode,
  DFU_PACKET_MAX_SIZE,
  FLASH_PAGE_SIZE,
} from "./dfu-protocol.js";