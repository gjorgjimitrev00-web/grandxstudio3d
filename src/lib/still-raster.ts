const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function isAllowedRaster(input: Buffer) {
  if (input.subarray(0, 8).equals(PNG_HEADER)) {
    // Some PNG decoders expose only the first APNG frame. Reject the animation control chunk.
    let offset = 8;
    while (offset + 12 <= input.length) {
      const length = input.readUInt32BE(offset);
      if (input.toString('ascii', offset + 4, offset + 8) === 'acTL') return false;
      if (length > input.length - offset - 12) return false;
      offset += 12 + length;
    }
    return true;
  }
  return (
    (input[0] === 255 && input[1] === 216 && input[2] === 255) ||
    (input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP')
  );
}
