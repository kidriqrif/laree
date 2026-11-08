// Packs PNG images into a .ico container (PNG-in-ICO, read by every browser and by Windows Vista on).
//
// Layout: a 6-byte ICONDIR (reserved 0, type 1, count), one 16-byte ICONDIRENTRY per image
// (width, height, colours, reserved, planes, bits per pixel, byte size, offset), then the PNG data.
// All numbers are little-endian; a width or height of 256 is written as 0.

export interface IcoImage {
  /** Square size in pixels, 1 to 256. */
  size: number;
  /** A complete PNG file. */
  png: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function makeIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) throw new RangeError('an icon needs at least one image');
  const sorted = images.toSorted((a, b) => a.size - b.size);
  const dir = Buffer.alloc(6 + 16 * sorted.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(sorted.length, 4);
  let offset = dir.length;
  sorted.forEach((img, i) => {
    if (!Number.isInteger(img.size) || img.size < 1 || img.size > 256) throw new RangeError(`bad icon size ${img.size}`);
    if (!PNG_SIGNATURE.every((b, j) => img.png[j] === b)) throw new TypeError(`the ${img.size} px image is not a PNG`);
    const e = 6 + 16 * i;
    const side = img.size === 256 ? 0 : img.size;
    dir.writeUInt8(side, e); // width
    dir.writeUInt8(side, e + 1); // height
    dir.writeUInt8(0, e + 2); // palette colours: none
    dir.writeUInt8(0, e + 3); // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });
  return Buffer.concat([dir, ...sorted.map((img) => Buffer.from(img.png))]);
}

/** Reads the directory back: [size, byteLength, offset] per image. Used to check the output. */
export function readIcoDirectory(ico: Uint8Array): [number, number, number][] {
  const b = Buffer.from(ico.buffer, ico.byteOffset, ico.byteLength);
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) throw new TypeError('not an icon file');
  const out: [number, number, number][] = [];
  for (let i = 0; i < b.readUInt16LE(4); i++) {
    const e = 6 + 16 * i;
    out.push([b.readUInt8(e) || 256, b.readUInt32LE(e + 8), b.readUInt32LE(e + 12)]);
  }
  return out;
}
