const VERCEL_FUNCTION_BODY_LIMIT_BYTES = 4_500_000;
const SAFE_STATELESS_UPLOAD_BUDGET_BYTES = 4_000_000;
const MULTIPART_BASE_OVERHEAD_BYTES = 1_024;
const MULTIPART_FILE_OVERHEAD_BYTES = 512;
const MIN_OPTIMIZABLE_FILE_BYTES = 150_000;

type OptimizationProfile = {
  maxDimension: number;
  quality: number;
};

type PreparedStatelessUpload = {
  files: File[];
  optimized: boolean;
  estimatedPayloadBytes: number;
};

const OPTIMIZATION_PROFILES: OptimizationProfile[] = [
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1365, quality: 0.72 },
  { maxDimension: 1024, quality: 0.64 }
];

function isRasterImage(file: File): boolean {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

function fileMultipartOverhead(file: File): number {
  return MULTIPART_FILE_OVERHEAD_BYTES + file.name.length * 2 + (file.type || "application/octet-stream").length * 2;
}

export function estimateStatelessUploadPayloadBytes(files: File[]): number {
  return files.reduce(
    (total, file) => total + file.size + fileMultipartOverhead(file),
    MULTIPART_BASE_OVERHEAD_BYTES
  );
}

export function needsStatelessUploadOptimization(files: File[]): boolean {
  return estimateStatelessUploadPayloadBytes(files) > SAFE_STATELESS_UPLOAD_BUDGET_BYTES;
}

export function buildStatelessPayloadTooLargeMessage(estimatedPayloadBytes: number): string {
  return [
    `Selected photos still total about ${(estimatedPayloadBytes / 1_000_000).toFixed(1)} MB after optimization.`,
    `Vercel caps function request bodies at ${(VERCEL_FUNCTION_BODY_LIMIT_BYTES / 1_000_000).toFixed(1)} MB in stateless mode.`,
    "Choose fewer photos, upload smaller originals, or deploy in stateful mode with direct uploads."
  ].join(" ");
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to decode ${file.name}.`));
      image.src = url;
    });

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Unable to encode optimized image."));
      },
      "image/jpeg",
      quality
    );
  });
}

async function optimizeRasterImage(file: File, profile: OptimizationProfile): Promise<File> {
  const image = await loadImage(file);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestEdge > profile.maxDimension ? profile.maxDimension / longestEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create a canvas for image optimization.");
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, profile.quality);

  if (blob.size >= file.size) {
    return file;
  }

  return new File([blob], file.name, {
    type: "image/jpeg",
    lastModified: file.lastModified
  });
}

export async function prepareStatelessUploadFiles(files: File[]): Promise<PreparedStatelessUpload> {
  let currentFiles = [...files];
  let estimatedPayloadBytes = estimateStatelessUploadPayloadBytes(currentFiles);

  if (estimatedPayloadBytes <= SAFE_STATELESS_UPLOAD_BUDGET_BYTES) {
    return {
      files: currentFiles,
      optimized: false,
      estimatedPayloadBytes
    };
  }

  for (const profile of OPTIMIZATION_PROFILES) {
    currentFiles = await Promise.all(
      currentFiles.map(async (file) => {
        if (!isRasterImage(file) || file.size < MIN_OPTIMIZABLE_FILE_BYTES) {
          return file;
        }

        try {
          return await optimizeRasterImage(file, profile);
        } catch {
          return file;
        }
      })
    );

    estimatedPayloadBytes = estimateStatelessUploadPayloadBytes(currentFiles);
    if (estimatedPayloadBytes <= SAFE_STATELESS_UPLOAD_BUDGET_BYTES) {
      return {
        files: currentFiles,
        optimized: true,
        estimatedPayloadBytes
      };
    }
  }

  throw new Error(buildStatelessPayloadTooLargeMessage(estimatedPayloadBytes));
}
