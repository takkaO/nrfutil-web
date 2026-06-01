/**
 * DFU protocol constants and command payload builders.
 *
 * Implements the Adafruit nRF52 DFU protocol (based on Nordic nrfutil v0.5.x).
 * Each command payload starts with a 4-byte little-endian command ID,
 * followed by command-specific data.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/** DFU command IDs (4-byte little-endian, first field in every HCI payload) */
export const DfuCommand = {
  INIT_PACKET: 1,
  START_PACKET: 3,
  DATA_PACKET: 4,
  STOP_DATA_PACKET: 5,
} as const;

/** DFU firmware update mode */
export const DfuUpdateMode = {
  SOFTDEVICE: 1,
  BOOTLOADER: 2,
  SD_BL: 3,
  APPLICATION: 4,
} as const;

/** Maximum size of a single data packet payload */
export const DFU_PACKET_MAX_SIZE = 512;

/** Flash page size for nRF52 (bytes) */
export const FLASH_PAGE_SIZE = 4096;

/** Timing constants */
export const DfuTiming = {
  /** Wait time after 1200bps touch to enter DFU mode (seconds) */
  TOUCH_RESET_WAIT: 1500,
  /** Wait time after DTR reset (ms) */
  DTR_RESET_WAIT: 100,
  /** Timeout for ACK response (ms) */
  ACK_TIMEOUT: 5000,
  /** Time to erase one flash page (seconds) */
  FLASH_PAGE_ERASE_TIME: 0.0897,
  /** Time to write one word (seconds) */
  FLASH_WORD_WRITE_TIME: 0.0001,
  /** Time to write one flash page (seconds) */
  FLASH_PAGE_WRITE_TIME: (FLASH_PAGE_SIZE / 4) * 0.0001,
} as const;

/**
 * Encode a 32-bit integer as 4 bytes little-endian.
 */
export function int32ToBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >> 8) & 0xff;
  bytes[2] = (value >> 16) & 0xff;
  bytes[3] = (value >> 24) & 0xff;
  return bytes;
}

/**
 * Encode a 16-bit integer as 2 bytes little-endian.
 */
export function int16ToBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[0] = value & 0xff;
  bytes[1] = (value >> 8) & 0xff;
  return bytes;
}

/**
 * Build a START_PACKET payload.
 *
 * Format: [START_PACKET (4 bytes)] [mode (4 bytes)] [sd_size (4 bytes)] [bl_size (4 bytes)] [app_size (4 bytes)]
 *
 * @param mode - Update mode (from DfuUpdateMode)
 * @param softdeviceSize - Size of SoftDevice in bytes
 * @param bootloaderSize - Size of bootloader in bytes
 * @param applicationSize - Size of application in bytes
 * @returns HCI payload bytes
 */
export function buildStartPacket(
  mode: number,
  softdeviceSize: number,
  bootloaderSize: number,
  applicationSize: number
): Uint8Array {
  const payload = new Uint8Array(20);
  payload.set(int32ToBytes(DfuCommand.START_PACKET), 0);
  payload.set(int32ToBytes(mode), 4);
  payload.set(int32ToBytes(softdeviceSize), 8);
  payload.set(int32ToBytes(bootloaderSize), 12);
  payload.set(int32ToBytes(applicationSize), 16);
  return payload;
}

/**
 * Build an INIT_PACKET payload.
 *
 * Format: [INIT_PACKET (4 bytes)] [init_data...] [padding (2 bytes)]
 *
 * @param initData - Init packet data (from .dat file)
 * @returns HCI payload bytes
 */
export function buildInitPacket(initData: Uint8Array): Uint8Array {
  const payload = new Uint8Array(4 + initData.length + 2);
  payload.set(int32ToBytes(DfuCommand.INIT_PACKET), 0);
  payload.set(initData, 4);
  // 2 bytes padding (0x0000) at the end — required by protocol
  payload[4 + initData.length] = 0x00;
  payload[4 + initData.length + 1] = 0x00;
  return payload;
}

/**
 * Build a DATA_PACKET payload.
 *
 * Format: [DATA_PACKET (4 bytes)] [firmware_chunk...]
 *
 * @param chunk - Firmware data chunk (up to DFU_PACKET_MAX_SIZE bytes)
 * @returns HCI payload bytes
 */
export function buildDataPacket(chunk: Uint8Array): Uint8Array {
  const payload = new Uint8Array(4 + chunk.length);
  payload.set(int32ToBytes(DfuCommand.DATA_PACKET), 0);
  payload.set(chunk, 4);
  return payload;
}

/**
 * Build a STOP_DATA_PACKET payload.
 *
 * Format: [STOP_DATA_PACKET (4 bytes)]
 *
 * @returns HCI payload bytes
 */
export function buildStopDataPacket(): Uint8Array {
  return int32ToBytes(DfuCommand.STOP_DATA_PACKET);
}

/**
 * Calculate the flash erase wait time based on firmware size.
 *
 * @param totalSize - Total firmware size in bytes
 * @returns Wait time in milliseconds (minimum 500ms)
 */
export function getEraseWaitTime(totalSize: number): number {
  const pages = Math.floor(totalSize / FLASH_PAGE_SIZE) + 1;
  const time = pages * DfuTiming.FLASH_PAGE_ERASE_TIME * 1000;
  return Math.max(500, time);
}

/**
 * Calculate the activate wait time after DFU completion.
 *
 * @param totalSize - Total firmware size in bytes
 * @param singleBank - Whether single bank mode is used
 * @param softdeviceSize - SoftDevice size (0 if not updating SD)
 * @returns Wait time in milliseconds
 */
export function getActivateWaitTime(
  totalSize: number,
  singleBank: boolean,
  softdeviceSize: number
): number {
  if (singleBank && softdeviceSize === 0) {
    // Single bank, no SD update: only need to save bootloader settings
    return (DfuTiming.FLASH_PAGE_ERASE_TIME + DfuTiming.FLASH_PAGE_WRITE_TIME) * 1000;
  }
  // Dual bank: erase + copy bank1 → bank0
  const pages = Math.floor(totalSize / FLASH_PAGE_SIZE) + 1;
  const eraseTime = pages * DfuTiming.FLASH_PAGE_ERASE_TIME;
  const writeTime = pages * DfuTiming.FLASH_PAGE_WRITE_TIME;
  return (eraseTime + writeTime) * 1000;
}