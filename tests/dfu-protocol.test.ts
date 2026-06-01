import { describe, it, expect } from "vitest";
import {
  DfuCommand,
  DfuUpdateMode,
  int32ToBytes,
  int16ToBytes,
  buildStartPacket,
  buildInitPacket,
  buildDataPacket,
  buildStopDataPacket,
  getEraseWaitTime,
  getActivateWaitTime,
} from "../src/dfu-protocol";

describe("int32ToBytes", () => {
  it("リトルエンディアンで4バイトに変換する", () => {
    const bytes = int32ToBytes(0x04030201);
    expect(bytes).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
  });

  it("0を正しく変換する", () => {
    expect(int32ToBytes(0)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it("DFU_START_PACKETの値(3)を変換する", () => {
    const bytes = int32ToBytes(DfuCommand.START_PACKET);
    expect(bytes).toEqual(new Uint8Array([0x03, 0x00, 0x00, 0x00]));
  });
});

describe("int16ToBytes", () => {
  it("リトルエンディアンで2バイトに変換する", () => {
    const bytes = int16ToBytes(0x0201);
    expect(bytes).toEqual(new Uint8Array([0x01, 0x02]));
  });
});

describe("buildStartPacket", () => {
  it("正しい構造のパケットを生成する", () => {
    const payload = buildStartPacket(
      DfuUpdateMode.APPLICATION,
      0,
      0,
      32768
    );

    // 4 (cmd) + 4 (mode) + 4 (sd) + 4 (bl) + 4 (app) = 20 bytes
    expect(payload.length).toBe(20);

    // Command ID = START_PACKET (3)
    expect(payload[0]).toBe(0x03);
    expect(payload[1]).toBe(0x00);
    expect(payload[2]).toBe(0x00);
    expect(payload[3]).toBe(0x00);

    // Mode = APPLICATION (4)
    expect(payload[4]).toBe(0x04);

    // Application size = 32768 = 0x8000
    const view = new DataView(payload.buffer);
    expect(view.getUint32(16, true)).toBe(32768);
  });
});

describe("buildInitPacket", () => {
  it("init データの前後にコマンドIDとパディングを付加する", () => {
    const initData = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const payload = buildInitPacket(initData);

    // 4 (cmd) + 3 (data) + 2 (padding) = 9 bytes
    expect(payload.length).toBe(9);

    // Command ID = INIT_PACKET (1)
    expect(payload[0]).toBe(0x01);
    expect(payload[1]).toBe(0x00);
    expect(payload[2]).toBe(0x00);
    expect(payload[3]).toBe(0x00);

    // Data
    expect(payload[4]).toBe(0xAA);
    expect(payload[5]).toBe(0xBB);
    expect(payload[6]).toBe(0xCC);

    // Padding
    expect(payload[7]).toBe(0x00);
    expect(payload[8]).toBe(0x00);
  });
});

describe("buildDataPacket", () => {
  it("チャンクデータの前にコマンドIDを付加する", () => {
    const chunk = new Uint8Array([0x01, 0x02, 0x03]);
    const payload = buildDataPacket(chunk);

    // 4 (cmd) + 3 (data) = 7 bytes
    expect(payload.length).toBe(7);

    // Command ID = DATA_PACKET (4)
    expect(payload[0]).toBe(0x04);
    expect(payload[1]).toBe(0x00);
    expect(payload[2]).toBe(0x00);
    expect(payload[3]).toBe(0x00);

    // Data
    expect(payload[4]).toBe(0x01);
    expect(payload[5]).toBe(0x02);
    expect(payload[6]).toBe(0x03);
  });
});

describe("buildStopDataPacket", () => {
  it("コマンドIDのみの4バイトを返す", () => {
    const payload = buildStopDataPacket();
    expect(payload.length).toBe(4);
    expect(payload[0]).toBe(0x05);
    expect(payload[1]).toBe(0x00);
    expect(payload[2]).toBe(0x00);
    expect(payload[3]).toBe(0x00);
  });
});

describe("getEraseWaitTime", () => {
  it("最低500msを返す", () => {
    expect(getEraseWaitTime(100)).toBeGreaterThanOrEqual(500);
  });

  it("サイズが大きいほど長い時間を返す", () => {
    const smallWait = getEraseWaitTime(4096);
    const largeWait = getEraseWaitTime(4096 * 100);
    expect(largeWait).toBeGreaterThan(smallWait);
  });
});

describe("getActivateWaitTime", () => {
  it("シングルバンクでSD無しの場合は短い時間を返す", () => {
    const time = getActivateWaitTime(32768, true, 0);
    expect(time).toBeLessThan(500);
  });

  it("デュアルバンクの場合はより長い時間を返す", () => {
    const singleTime = getActivateWaitTime(32768, true, 0);
    const dualTime = getActivateWaitTime(32768, false, 0);
    expect(dualTime).toBeGreaterThan(singleTime);
  });
});