import { describe, it, expect } from "vitest";
import { slipEncode, slipDecode, SlipDecoder } from "../src/slip";

describe("slipEncode", () => {
  it("通常のデータをENDバイトで囲む", () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const encoded = slipEncode(data);
    expect(encoded[0]).toBe(0xc0);
    expect(encoded[encoded.length - 1]).toBe(0xc0);
    expect(encoded).toEqual(
      new Uint8Array([0xc0, 0x01, 0x02, 0x03, 0xc0])
    );
  });

  it("ENDバイト(0xC0)をエスケープする", () => {
    const data = new Uint8Array([0xc0]);
    const encoded = slipEncode(data);
    expect(encoded).toEqual(
      new Uint8Array([0xc0, 0xdb, 0xdc, 0xc0])
    );
  });

  it("ESCバイト(0xDB)をエスケープする", () => {
    const data = new Uint8Array([0xdb]);
    const encoded = slipEncode(data);
    expect(encoded).toEqual(
      new Uint8Array([0xc0, 0xdb, 0xdd, 0xc0])
    );
  });

  it("複数の特殊バイトを含むデータを正しくエスケープする", () => {
    const data = new Uint8Array([0x01, 0xc0, 0x02, 0xdb, 0x03]);
    const encoded = slipEncode(data);
    expect(encoded).toEqual(
      new Uint8Array([0xc0, 0x01, 0xdb, 0xdc, 0x02, 0xdb, 0xdd, 0x03, 0xc0])
    );
  });

  it("空データを処理する", () => {
    const data = new Uint8Array([]);
    const encoded = slipEncode(data);
    expect(encoded).toEqual(new Uint8Array([0xc0, 0xc0]));
  });
});

describe("slipDecode", () => {
  it("エンコードされたフレームをデコードする", () => {
    const frame = new Uint8Array([0xc0, 0x01, 0x02, 0x03, 0xc0]);
    const decoded = slipDecode(frame);
    expect(decoded).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
  });

  it("エスケープされたENDバイトを復元する", () => {
    const frame = new Uint8Array([0xc0, 0xdb, 0xdc, 0xc0]);
    const decoded = slipDecode(frame);
    expect(decoded).toEqual(new Uint8Array([0xc0]));
  });

  it("エスケープされたESCバイトを復元する", () => {
    const frame = new Uint8Array([0xc0, 0xdb, 0xdd, 0xc0]);
    const decoded = slipDecode(frame);
    expect(decoded).toEqual(new Uint8Array([0xdb]));
  });

  it("不完全なフレームにはnullを返す", () => {
    const frame = new Uint8Array([0xc0, 0x01, 0x02]);
    expect(slipDecode(frame)).toBeNull();
  });

  it("ENDバイトがないデータにはnullを返す", () => {
    const frame = new Uint8Array([0x01, 0x02, 0x03]);
    expect(slipDecode(frame)).toBeNull();
  });

  it("不正なエスケープシーケンスにはnullを返す", () => {
    const frame = new Uint8Array([0xc0, 0xdb, 0x01, 0xc0]);
    expect(slipDecode(frame)).toBeNull();
  });

  it("エンコードとデコードの往復が一致する", () => {
    const original = new Uint8Array([0x00, 0xc0, 0xdb, 0xff, 0x42]);
    const encoded = slipEncode(original);
    const decoded = slipDecode(encoded);
    expect(decoded).toEqual(original);
  });
});

describe("SlipDecoder", () => {
  it("完全なフレームを1つデコードする", () => {
    const decoder = new SlipDecoder();
    const frames = decoder.feed(
      new Uint8Array([0xc0, 0x01, 0x02, 0xc0])
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([0x01, 0x02]));
  });

  it("分割されたデータからフレームを組み立てる", () => {
    const decoder = new SlipDecoder();

    let frames = decoder.feed(new Uint8Array([0xc0, 0x01]));
    expect(frames).toHaveLength(0);

    frames = decoder.feed(new Uint8Array([0x02, 0xc0]));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([0x01, 0x02]));
  });

  it("連続する複数のフレームをデコードする", () => {
    const decoder = new SlipDecoder();
    const frames = decoder.feed(
      new Uint8Array([0xc0, 0x01, 0xc0, 0xc0, 0x02, 0xc0])
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual(new Uint8Array([0x01]));
    expect(frames[1]).toEqual(new Uint8Array([0x02]));
  });

  it("resetでバッファがクリアされる", () => {
    const decoder = new SlipDecoder();

    decoder.feed(new Uint8Array([0xc0, 0x01, 0x02]));
    decoder.reset();

    const frames = decoder.feed(
      new Uint8Array([0xc0, 0x03, 0x04, 0xc0])
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([0x03, 0x04]));
  });

  it("フレーム外のデータは無視する", () => {
    const decoder = new SlipDecoder();
    const frames = decoder.feed(
      new Uint8Array([0x99, 0x98, 0xc0, 0x01, 0xc0])
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([0x01]));
  });
});