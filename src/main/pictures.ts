import { nativeImage } from "electron";
import { MAX_PICTURE_BYTES, MAX_PICTURE_SIDE, THUMBNAIL_SIDE } from "../shared/attachments";
import type { PreparePicture } from "./Attachments";

const JPEG_QUALITY = 85;

// A PNG or JPEG, scaled down so its longest side is at most the limit. A PNG stays one unless that's too heavy, since a
// screenshot's text stays sharper that way. The thumbnail is the middle square, for the chip.
export const preparePicture: PreparePicture = (bytes) => {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return null;
  const scale = Math.min(1, MAX_PICTURE_SIDE / Math.max(width, height));
  const sized = scale < 1 ? image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: "good" }) : image;
  const png = sized.toPNG();
  const asPng = png.length <= MAX_PICTURE_BYTES && bytes[0] === 0x89;
  const data = asPng ? png : sized.toJPEG(JPEG_QUALITY);
  if (data.length > MAX_PICTURE_BYTES) return null;
  const side = Math.min(width, height);
  const square = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  const thumbnail = square.resize({ width: THUMBNAIL_SIDE, height: THUMBNAIL_SIDE, quality: "good" }).toDataURL();
  return { data, mime: asPng ? "image/png" : "image/jpeg", thumbnail };
};
