import { deflateSync } from "fflate";

/**
 * Streaming ZIP writer for library exports. Each file is written as soon as it
 * is added, so only the file being written is held in memory. Archives,
 * offsets, and sizes past 4 GiB use ZIP64 records; smaller archives are
 * ordinary ZIP files. Names are UTF-8.
 */

const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Little-endian record builder. */
class Record {
  private bytes: number[] = [];
  u16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }
  u32(value: number) {
    this.u16(value & 0xffff).u16(Math.floor(value / 0x10000) & 0xffff);
    return this;
  }
  u64(value: number) {
    return this.u32(value % 0x100000000).u32(Math.floor(value / 0x100000000));
  }
  raw(data: Uint8Array) {
    for (const byte of data) this.bytes.push(byte);
    return this;
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

type Entry = {
  name: Uint8Array;
  crc: number;
  method: number;
  size: number;
  compressedSize: number;
  offset: number;
};

export class ZipWriter {
  private offset = 0;
  private readonly entries: Entry[] = [];
  private readonly stamp = dosDateTime(new Date());
  private readonly write: (chunk: Uint8Array) => Promise<void>;

  constructor(write: (chunk: Uint8Array) => Promise<void>) {
    this.write = write;
  }

  private async emit(chunk: Uint8Array) {
    await this.write(chunk);
    this.offset += chunk.length;
  }

  /** Add one file. `compress` deflates it when that makes it smaller. */
  async add(path: string, data: Uint8Array, compress: boolean) {
    const name = new TextEncoder().encode(path);
    const deflated = compress ? deflateSync(data, { level: 6 }) : null;
    const useDeflate = deflated !== null && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const entry: Entry = {
      name,
      crc: crc32(data),
      method: useDeflate ? 8 : 0,
      size: data.length,
      compressedSize: body.length,
      offset: this.offset,
    };
    const zip64 = entry.size >= MAX_32 || entry.compressedSize >= MAX_32;
    const header = new Record()
      .u32(0x04034b50)
      .u16(zip64 ? 45 : 20)
      .u16(0x0800) // UTF-8 names
      .u16(entry.method)
      .u16(this.stamp.time)
      .u16(this.stamp.date)
      .u32(entry.crc)
      .u32(zip64 ? MAX_32 : entry.compressedSize)
      .u32(zip64 ? MAX_32 : entry.size)
      .u16(name.length)
      .u16(zip64 ? 20 : 0)
      .raw(name);
    if (zip64) header.u16(0x0001).u16(16).u64(entry.size).u64(entry.compressedSize);
    await this.emit(header.done());
    await this.emit(body);
    this.entries.push(entry);
  }

  /** Write the central directory and end records. */
  async finish() {
    const directoryOffset = this.offset;
    for (const entry of this.entries) {
      const bigSize = entry.size >= MAX_32 || entry.compressedSize >= MAX_32;
      const bigOffset = entry.offset >= MAX_32;
      const extra = new Record();
      if (bigSize) extra.u64(entry.size).u64(entry.compressedSize);
      if (bigOffset) extra.u64(entry.offset);
      const extraBytes = extra.done();
      const zip64 = bigSize || bigOffset;
      const record = new Record()
        .u32(0x02014b50)
        .u16(45) // made by: ZIP 4.5
        .u16(zip64 ? 45 : 20)
        .u16(0x0800)
        .u16(entry.method)
        .u16(this.stamp.time)
        .u16(this.stamp.date)
        .u32(entry.crc)
        .u32(bigSize ? MAX_32 : entry.compressedSize)
        .u32(bigSize ? MAX_32 : entry.size)
        .u16(entry.name.length)
        .u16(zip64 ? 4 + extraBytes.length : 0)
        .u16(0) // comment
        .u16(0) // disk
        .u16(0) // internal attributes
        .u32(0) // external attributes
        .u32(bigOffset ? MAX_32 : entry.offset)
        .raw(entry.name);
      if (zip64) record.u16(0x0001).u16(extraBytes.length).raw(extraBytes);
      await this.emit(record.done());
    }
    const directorySize = this.offset - directoryOffset;
    const count = this.entries.length;
    const zip64 = count >= MAX_16 || directoryOffset >= MAX_32 || directorySize >= MAX_32;
    if (zip64) {
      const recordOffset = this.offset;
      await this.emit(
        new Record()
          .u32(0x06064b50)
          .u64(44)
          .u16(45)
          .u16(45)
          .u32(0)
          .u32(0)
          .u64(count)
          .u64(count)
          .u64(directorySize)
          .u64(directoryOffset)
          .done(),
      );
      await this.emit(new Record().u32(0x07064b50).u32(0).u64(recordOffset).u32(1).done());
    }
    await this.emit(
      new Record()
        .u32(0x06054b50)
        .u16(0)
        .u16(0)
        .u16(zip64 ? MAX_16 : count)
        .u16(zip64 ? MAX_16 : count)
        .u32(zip64 ? MAX_32 : directorySize)
        .u32(zip64 ? MAX_32 : directoryOffset)
        .u16(0)
        .done(),
    );
  }
}
