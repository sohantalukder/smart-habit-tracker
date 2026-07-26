import type { Area } from "react-easy-crop";

export async function croppedAvatarFile(source: string, crop: Area) {
  const image = await loadImage(source);
  const outputSize = Math.min(1024, Math.max(512, crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the profile photo.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputSize,
    outputSize,
  );
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.9);
  });
  if (!blob) throw new Error("The cropped profile photo could not be prepared.");
  return new File([blob], "profile-avatar.webp", { type: "image/webp" });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be opened."));
    image.src = source;
  });
}
