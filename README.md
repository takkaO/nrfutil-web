# nrfutil-web

WebSerial を使った nRF52 デバイス向け DFU（Device Firmware Update）ライブラリです。
ブラウザから直接ファームウェアを書き込むことができます。

## 特徴

- ブラウザの [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) を使用
- Adafruit nRF52 ブートローダーの DFU プロトコルに対応
- adafruit-nrfutil が生成する ZIP パッケージをそのまま使用可能
- アプリケーション・SoftDevice・ブートローダー・SD+BL の書き込みに対応
- 書き込み進捗コールバック対応
- TypeScript 対応（型定義付き）
- 依存ライブラリは `jszip` のみ

## 動作要件

- Web Serial API 対応ブラウザ（Chrome / Edge など）
- adafruit-nrfutil で生成した DFU パッケージ（ZIP 形式）

## インストール

```bash
pnpm add nrfutil-web
# または
npm install nrfutil-web
```

## 使い方

### 基本的な使い方

```ts
import { performDfu, enterDfuMode } from "nrfutil-web";

// 1. アプリケーションポートへ接続
const appPort = await navigator.serial.requestPort();

// 2. 1200bps タッチで DFU モードへ移行
await enterDfuMode(appPort);

// 3. デバイスが再接続されるまで待ち、DFU ポートを選択
const dfuPort = await navigator.serial.requestPort();

// 4. ファームウェアを取得して書き込み
const zipData = await fetch("/firmware.zip").then(r => r.arrayBuffer());

await performDfu(dfuPort, zipData, {
  onProgress: ({ percent, message }) => {
    console.log(`${percent}% - ${message}`);
  },
});
```

### API リファレンス

#### `performDfu(port, zipData, options?)`

DFU ファームウェア更新を実行します。

| パラメータ | 型 | 説明 |
|---|---|---|
| `port` | `SerialPortLike` | WebSerial ポート |
| `zipData` | `ArrayBuffer` | DFU パッケージ ZIP |
| `options.onProgress` | `ProgressCallback` | 進捗コールバック |
| `options.ackTimeout` | `number` | ACK タイムアウト（ms、デフォルト: 5000） |
| `options.maxRetries` | `number` | 最大リトライ回数（デフォルト: 3） |
| `options.singleBank` | `boolean` | シングルバンクモード（デフォルト: `true`） |

#### `enterDfuMode(port, waitTime?)`

1200bps タッチを送信してデバイスを DFU モードへ移行させます。

| パラメータ | 型 | 説明 |
|---|---|---|
| `port` | `SerialPortLike` | WebSerial ポート |
| `waitTime` | `number` | DFU モード移行後の待機時間（ms、デフォルト: 1500） |

#### `ProgressCallback`

```ts
type ProgressCallback = (progress: {
  sent: number;    // 送信済みバイト数
  total: number;   // 合計バイト数
  percent: number; // 進捗 (0–100)
  message: string; // 現在の操作の説明
}) => void;
```

### 高度な使い方

低レイヤーへのアクセスも可能です。

```ts
import { DfuSerialTransport, parseDfuPackage } from "nrfutil-web";

// ZIP を手動でパース
const images = await parseDfuPackage(zipData);

// トランスポートを直接操作
const transport = new DfuSerialTransport(port, { ackTimeout: 10000 });
await transport.open();
await transport.sendPacket(payload);
await transport.close();
```

## 開発

```bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm build

# テスト
pnpm test

# デモページを起動（examples/index.html）
pnpm dev
```

## アーキテクチャ

```
src/
├── index.ts          # 公開 API
├── dfu.ts            # DFU メインコントローラー
├── transport.ts      # シリアルトランスポート（HCI / SLIP / ACK）
├── package.ts        # DFU ZIP パッケージパーサー
├── dfu-protocol.ts   # プロトコル定数・パケットビルダー
├── hci.ts            # HCI パケット処理
├── slip.ts           # SLIP エンコード / デコード
└── crc16.ts          # CRC-16 計算
```

## ライセンス

BSD-3-Clause
