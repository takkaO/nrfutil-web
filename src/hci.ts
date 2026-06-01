/**
 * HCI packet construction and parsing for Nordic DFU over serial.
 *
 * The HCI packet format wraps DFU payloads with a header containing
 * sequence numbers, integrity checks, and a checksum.
 *
 * Header format (4 bytes):
 *   byte 0: seq_no (3 bits) | ack_no (3 bits) | data_integrity (1 bit) | reliable (1 bit)
 *   byte 1: packet_type (low nibble) | payload_length low 4 bits (high nibble)
 *   byte 2: payload_length upper bits (shifted right by 4)
 *   byte 3: two's complement checksum of bytes 0-2
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

import { crc16 } from "./crc16.js";

/** HCI packet type used by DFU */
const HCI_PACKET_TYPE = 14;

/** Header flags */
const DATA_INTEGRITY_CHECK_PRESENT = 1;
const RELIABLE_PACKET = 1;

/**
 * Build an HCI packet header + payload + CRC16.
 *
 * @param sequenceNumber - Current sequence number (0-7)
 * @param payload - DFU payload data
 * @returns Complete HCI packet (header + payload + CRC16)
 */
export function buildHciPacket(
  sequenceNumber: number,
  payload: Uint8Array
): Uint8Array {
  const seq = sequenceNumber & 0x07;
  const ack = ((sequenceNumber + 1) % 8) & 0x07;

  const payloadLength = payload.length;

  // Byte 0: seq(3) | ack(3) | data_integrity(1) | reliable(1)
  const byte0 =
    (seq & 0x07) |
    ((ack & 0x07) << 3) |
    (DATA_INTEGRITY_CHECK_PRESENT << 6) |
    (RELIABLE_PACKET << 7);

  // Byte 1: packet_type(low nibble) | payload_length low 4 bits(high nibble)
  const byte1 =
    (HCI_PACKET_TYPE & 0x0f) | ((payloadLength & 0x0f) << 4);

  // Byte 2: payload_length upper bits (>> 4)
  const byte2 = (payloadLength >> 4) & 0xff;

  // Byte 3: two's complement checksum of bytes 0-2
  const byte3 = (~(byte0 + byte1 + byte2) + 1) & 0xff;

  // Build complete packet: header(4) + payload + CRC16(2)
  const packet = new Uint8Array(4 + payload.length + 2);

  // Header
  packet[0] = byte0;
  packet[1] = byte1;
  packet[2] = byte2;
  packet[3] = byte3;

  // Payload
  packet.set(payload, 4);

  // CRC16 over header + payload (little-endian)
  const packetCrc = crc16(packet.subarray(0, 4 + payload.length));
  packet[4 + payload.length] = packetCrc & 0xff;
  packet[4 + payload.length + 1] = (packetCrc >> 8) & 0xff;

  return packet;
}

/**
 * Parse an HCI response packet and extract the ACK number.
 *
 * @param data - Decoded (un-SLIPed) response data
 * @returns Parsed ACK number, or null if invalid
 */
export function parseHciResponse(data: Uint8Array): {
  ackNumber: number;
  sequenceNumber: number;
} | null {
  if (data.length < 4) return null;

  const sequenceNumber = data[0] & 0x07;
  const ackNumber = (data[0] >> 3) & 0x07;

  return { ackNumber, sequenceNumber };
}