/**
 * CRC16-CCITT calculation.
 *
 * Standard CRC16-CCITT algorithm (polynomial 0x1021)
 * as used by the Nordic DFU protocol.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Calculates CRC16-CCITT over binary data.
 *
 * @param data - Binary data to calculate CRC over
 * @param crc - Initial CRC value (default: 0xFFFF)
 * @returns Calculated CRC16 value
 */
export function crc16(data: Uint8Array, crc: number = 0xffff): number {
  for (const byte of data) {
    crc = ((crc >> 8) & 0x00ff) | ((crc << 8) & 0xff00);
    crc ^= byte;
    crc ^= (crc & 0x00ff) >> 4;
    crc ^= (crc << 8) << 4;
    crc ^= ((crc & 0x00ff) << 4) << 1;
  }
  return crc & 0xffff;
}