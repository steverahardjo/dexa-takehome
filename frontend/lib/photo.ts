/** Long edge of the photo we keep; anything larger only costs bandwidth. */
const MAX_EDGE = 1080;
const JPEG_QUALITY = 0.82;

/** Draws an image on a canvas and returns a JPEG data URL, capped at `MAX_EDGE`. */
export function toScaledJpegDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number
): string | null {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Reads a file from the camera roll and returns a scaled JPEG data URL. */
export function readPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("The photo could not be read."));

    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("The photo could not be decoded."));

      image.onload = () => {
        const dataUrl = toScaledJpegDataUrl(
          image,
          image.naturalWidth,
          image.naturalHeight
        );

        if (!dataUrl) {
          reject(new Error("The photo could not be processed."));
          return;
        }

        resolve(dataUrl);
      };

      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });
}
