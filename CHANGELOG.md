# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-02

### Added

- Initial release
- `performDfu()` — flash nRF52 firmware from the browser via Web Serial
- `enterDfuMode()` — trigger DFU mode using 1200bps touch
- `DfuSerialTransport` — low-level serial transport with HCI/SLIP framing, ACK handling, and retries
- `parseDfuPackage()` — parse adafruit-nrfutil ZIP packages (Application, SoftDevice, Bootloader, SD+BL)
- Progress callback support via `onProgress`
- TypeScript type definitions
