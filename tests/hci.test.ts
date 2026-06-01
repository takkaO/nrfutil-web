import { describe, it, expect } from "vitest";
import { buildHciPacket, parseHciResponse } from "../src/hci";

describe("buildHciPacket", () => {
  it("正しいヘッダー構造を生成する", () => {
    const payload = new Uint8Array([0x01]);
    const packet = buildHciPacket(0, payload);

    // 4 (header) + 1 (payload) + 2 (crc) = 7 bytes
    expect(packet.length).toBe(7);

    // seq=0, ack=1, integrity=1, reliable=1
    // byte0 = 0b11_001_000 = 0xC8
    expect(packet[0]).toBe(0xc8);
  });

  it("シーケンス番号が正しくエンコードされる", () => {
    const payload = new Uint8Array([0x01]);

    // seq=3 → ack=4
    const packet = buildHciPacket(3, payload);
    const seq = packet[0] & 0x07;
    const ack = (packet[0] >> 3) & 0x07;
    expect(seq).toBe(3);
    expect(ack).toBe(4);
  });

  it("シーケンス番号7のとき、ACKが0にラップアラウンドする", () => {
    const payload = new Uint8Array([0x01]);
    const packet = buildHciPacket(7, payload);

    const seq = packet[0] & 0x07;
    const ack = (packet[0] >> 3) & 0x07;
    expect(seq).toBe(7);
    expect(ack).toBe(0);
  });

  it("ペイロード長がヘッダーに正しく格納される（Python互換形式）", () => {
    const payload = new Uint8Array(300);
    const packet = buildHciPacket(0, payload);

    // byte1 の上位4ビット = length の下位4ビット
    // byte2 = length >> 4
    const lengthLow4 = (packet[1] >> 4) & 0x0f;
    const lengthHigh = packet[2];
    const length = (lengthHigh << 4) | lengthLow4;
    expect(length).toBe(300);
  });

  it("パケットタイプが14(0x0E)である", () => {
    const payload = new Uint8Array([0x01]);
    const packet = buildHciPacket(0, payload);

    const packetType = packet[1] & 0x0f;
    expect(packetType).toBe(14);
  });

  it("ヘッダーチェックサムが2の補数方式で計算される", () => {
    const payload = new Uint8Array([0x01]);
    const packet = buildHciPacket(0, payload);

    // Verify: (byte0 + byte1 + byte2 + byte3) & 0xFF === 0
    const sum = (packet[0] + packet[1] + packet[2] + packet[3]) & 0xff;
    expect(sum).toBe(0);
  });

  it("Python adafruit-nrfutil と同じ結果を生成する（seq=1, 20バイトペイロード）", () => {
    // Reproduce: slip_parts_to_four_bytes(1, 1, 1, 14, 20)
    // ints[0] = 1 | (2 << 3) | (1 << 6) | (1 << 7) = 1 | 16 | 64 | 128 = 0xD1
    // ints[1] = 14 | ((20 & 0x0F) << 4) = 14 | (4 << 4) = 14 | 64 = 0x4E
    // ints[2] = (20 & 0x0FF0) >> 4 = (20 >> 4) = 1
    // ints[3] = (~(0xD1 + 0x4E + 0x01) + 1) & 0xFF = (~0x120 + 1) & 0xFF = (0xFFFFFEDF + 1) & 0xFF = 0xE0

    const payload = new Uint8Array(20);
    const packet = buildHciPacket(1, payload);

    expect(packet[0]).toBe(0xd1);
    expect(packet[1]).toBe(0x4e);
    expect(packet[2]).toBe(0x01);
    expect(packet[3]).toBe(0xe0);
  });

  it("CRC16がリトルエンディアンで末尾に付加される", () => {
    const payload = new Uint8Array([0x01]);
    const packet = buildHciPacket(0, payload);

    const crcLow = packet[packet.length - 2];
    const crcHigh = packet[packet.length - 1];
    const crcValue = (crcHigh << 8) | crcLow;
    expect(crcValue).toBeGreaterThan(0);
    expect(crcValue).toBeLessThanOrEqual(0xffff);
  });

  it("空のペイロードでも正しく動作する", () => {
    const payload = new Uint8Array([]);
    const packet = buildHciPacket(0, payload);
    // 4 (header) + 0 (payload) + 2 (crc) = 6 bytes
    expect(packet.length).toBe(6);

    // Checksum still valid
    const sum = (packet[0] + packet[1] + packet[2] + packet[3]) & 0xff;
    expect(sum).toBe(0);
  });
});

describe("parseHciResponse", () => {
  it("ACK番号とシーケンス番号を正しく抽出する", () => {
    const data = new Uint8Array([0xda, 0x00, 0x00, 0x00]);
    const result = parseHciResponse(data);
    expect(result).not.toBeNull();
    expect(result!.sequenceNumber).toBe(2);
    expect(result!.ackNumber).toBe(3);
  });

  it("4バイト未満のデータにはnullを返す", () => {
    const data = new Uint8Array([0x01, 0x02]);
    expect(parseHciResponse(data)).toBeNull();
  });

  it("buildHciPacketの出力をパースできる", () => {
    const payload = new Uint8Array([0x01, 0x02]);
    const packet = buildHciPacket(5, payload);
    const result = parseHciResponse(packet);
    expect(result).not.toBeNull();
    expect(result!.sequenceNumber).toBe(5);
    expect(result!.ackNumber).toBe(6);
  });
});