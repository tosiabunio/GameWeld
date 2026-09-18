import sharp from 'sharp';

/** An image whose left half is red and right half blue, so crops and rotations are visible. */
export async function halves(
  width: number,
  height: number,
  format: 'png' | 'jpeg',
  orientation?: number,
) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set(x < width / 2 ? [255, 0, 0] : [0, 0, 255], (y * width + x) * 3);
  const image = sharp(pixels, { raw: { width, height, channels: 3 } });
  const encoded = format === 'png' ? image.png() : image.jpeg({ quality: 95 });
  return (orientation ? encoded.withMetadata({ orientation }) : encoded).toBuffer();
}

/** Red or blue at a point of an encoded image. */
export async function colourAt(
  image: Buffer,
  x: number,
  y: number,
): Promise<'red' | 'blue' | 'other'> {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
  if (r > 200 && g < 60 && b < 60) return 'red';
  if (b > 200 && r < 60 && g < 60) return 'blue';
  return 'other';
}
