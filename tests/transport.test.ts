import { describe, it, expect, vi } from "vitest";
import { DfuSerialTransport, SerialPortLike } from "../src/transport";
import { slipEncode } from "../src/slip";
import { buildHciPacket } from "../src/hci";

/**
 * Create a mock serial port that returns ACK responses
 * only after data has been written.
 */
function createMockPort(ackCount: number): {
  port: SerialPortLike;
  written: Uint8Array[];
} {
  const written: Uint8Array[] = [];
  let writeCount = 0;
  let lastReadWriteCount = 0;

  const port: SerialPortLike = {
    readable: new ReadableStream({
      async pull(controller) {
        // Wait until a new write occurs
        const deadline = Date.now() + 2000;
        while (writeCount <= lastReadWriteCount && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 5));
        }

        if (writeCount > lastReadWriteCount && lastReadWriteCount < ackCount) {
          lastReadWriteCount = writeCount;
          // Build ACK for the sequence number (seq starts at 0, increments)
          const seq = lastReadWriteCount - 1;
          const hciPacket = buildHciPacket(seq, new Uint8Array([]));
          controller.enqueue(slipEncode(hciPacket));
        } else {
          // No more ACKs — just wait
          await new Promise((r) => setTimeout(r, 200));
        }
      },
    }),
    writable: new WritableStream({
      write(chunk) {
        written.push(chunk);
        writeCount++;
      },
    }),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setSignals: vi.fn().mockResolvedValue(undefined),
  };

  return { port, written };
}

describe("DfuSerialTransport", () => {
  it("open でポートを開きリーダー/ライターを取得する", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port);

    await transport.open();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    await transport.close();
  });

  it("open でカスタムボーレートを指定できる", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port);

    await transport.open(9600);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 });
    await transport.close();
  });

  it("close でポートを閉じる", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port);

    await transport.open();
    await transport.close();
    expect(port.close).toHaveBeenCalled();
  });

  it("open 時に DTR トグルを行う", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port);

    await transport.open();
    expect(port.setSignals).toHaveBeenCalledWith({
      dataTerminalReady: false,
    });
    expect(port.setSignals).toHaveBeenCalledWith({
      dataTerminalReady: true,
    });
    await transport.close();
  });

  it("sendPacket が SLIP エンコードされたデータを送信する", async () => {
    const { port, written } = createMockPort(1);
    const transport = new DfuSerialTransport(port, { ackTimeout: 1000 });

    await transport.open();

    const payload = new Uint8Array([0x03, 0x00, 0x00, 0x00]);
    await transport.sendPacket(payload);

    expect(written.length).toBeGreaterThan(0);
    expect(written[0][0]).toBe(0xc0);
    expect(written[0][written[0].length - 1]).toBe(0xc0);
    await transport.close();
  });

  it("sendPacket 後にシーケンス番号がインクリメントされる", async () => {
    const { port } = createMockPort(2);
    const transport = new DfuSerialTransport(port, { ackTimeout: 1000 });

    await transport.open();

    expect(transport.getSequenceNumber()).toBe(0);

    await transport.sendPacket(new Uint8Array([0x03, 0x00, 0x00, 0x00]));
    expect(transport.getSequenceNumber()).toBe(1);

    await transport.sendPacket(new Uint8Array([0x04, 0x00, 0x00, 0x00]));
    expect(transport.getSequenceNumber()).toBe(2);
    await transport.close();
  });

  it("全リトライ失敗後にエラーをスローする", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port, {
      ackTimeout: 100,
      maxRetries: 1,
    });

    await transport.open();

    await expect(
      transport.sendPacket(new Uint8Array([0x03, 0x00, 0x00, 0x00]))
    ).rejects.toThrow("Failed after");
    await transport.close();
  });

  it("未オープン状態で sendPacket するとエラー", async () => {
    const { port } = createMockPort(0);
    const transport = new DfuSerialTransport(port);

    await expect(
      transport.sendPacket(new Uint8Array([0x01]))
    ).rejects.toThrow("Transport is not open");
  });
});