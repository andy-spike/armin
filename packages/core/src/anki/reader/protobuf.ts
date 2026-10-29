/**
 * A minimal protobuf wire-format reader, enough for the few Anki messages the
 * importer needs (notetype config, template config, package metadata, media
 * entries). Only varint and length-delimited fields are surfaced; fixed-width
 * fields are skipped.
 */

export type ProtoField = {
  /** Field number from the `.proto` definition. */
  number: number;
  /** Set for varint fields. Large values lose precision; the importer only reads small enums. */
  varint?: number;
  /** Set for length-delimited fields (strings, bytes, nested messages). */
  bytes?: Uint8Array;
};

export function* readProtoFields(data: Uint8Array): Generator<ProtoField> {
  let pos = 0;

  const readVarint = () => {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (pos >= data.length) throw new Error("Truncated protobuf varint");
      const byte = data[pos++];
      result += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) return result;
      scale *= 128;
    }
    throw new Error("Protobuf varint too long");
  };

  while (pos < data.length) {
    const tag = readVarint();
    const number = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (wireType === 0) {
      yield { number, varint: readVarint() };
    } else if (wireType === 2) {
      const length = readVarint();
      if (pos + length > data.length) throw new Error("Truncated protobuf field");
      yield { number, bytes: data.subarray(pos, pos + length) };
      pos += length;
    } else if (wireType === 1) {
      pos += 8;
    } else if (wireType === 5) {
      pos += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
}

const utf8 = new TextDecoder();

export function protoString(field: ProtoField) {
  return field.bytes ? utf8.decode(field.bytes) : "";
}
