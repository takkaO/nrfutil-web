import { describe, it, expect } from "vitest";
import { crc16 } from "../src/crc16";

describe("crc16", () => {
  it("空データに対してデフォルト初期値を返す", () => {
    const data = new Uint8Array([]);
    expect(crc16(data)).toBe(0xffff);
  });

  it("1バイトのデータに対して正しいCRCを計算する", () => {
    const data = new Uint8Array([0x00]);
    expect(crc16(data)).toBe(0xe1f0);
  });

  it("ASCII文字列 '123456789' のCRC16-CCITTが0x29B1になる", () => {
    // CRC16-CCITT の標準テストベクター
    const data = new Uint8Array([
      0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
    ]);
    expect(crc16(data)).toBe(0x29b1);
  });

  it("初期値を指定して計算できる", () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const result = crc16(data, 0x0000);
    expect(result).not.toBe(crc16(data)); // デフォルトと異なる結果
    expect(typeof result).toBe("number");
  });

  it("分割して計算しても結果が同じ", () => {
    const full = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
    const fullCrc = crc16(full);

    // 前半と後半に分けて計算
    const first = new Uint8Array([0x01, 0x02, 0x03]);
    const second = new Uint8Array([0x04, 0x05]);
    const splitCrc = crc16(second, crc16(first));

    expect(splitCrc).toBe(fullCrc);
  });

  it("結果が16ビットの範囲に収まる", () => {
    const data = new Uint8Array(1024);
    data.fill(0xff);
    const result = crc16(data);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
  });
});