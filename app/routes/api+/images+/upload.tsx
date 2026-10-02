import { data } from "react-router";
import { parseFormData } from "@mjackson/form-data-parser";
import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "#app/utils/db.server.ts";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { uploadFile } from "#app/utils/storage.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/upload.ts";

// Image validation
const MIN_IMAGE_SIZE = 500; // 500x500 minimum
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  // Import sharp dynamically to avoid issues if not installed
  try {
    const sharp = await import("sharp");
    const metadata = await sharp.default(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch (error) {
    // If sharp is not available, return 0x0 (validation will fail if dimensions matter)
    console.error("Sharp not available for image processing:", error);
    return { width: 0, height: 0 };
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  await requireCuratorRole(request);

  // Parse multipart form data
  const formData = await parseFormData(request, { maxFileSize: MAX_IMAGE_SIZE });

  const imageFile = formData.get("image");
  const entityType = formData.get("entityType") as string; // 'artist' or 'album'
  const entityId = formData.get("entityId") as string;

  if (!imageFile || typeof imageFile === "string") {
    throw data({ error: "Image file is required" }, { status: 400 });
  }

  if (!entityType || !["artist", "album"].includes(entityType)) {
    throw data({ error: "Valid entityType is required (artist or album)" }, { status: 400 });
  }

  if (!entityId) {
    throw data({ error: "entityId is required" }, { status: 400 });
  }

  // Convert file to buffer
  const arrayBuffer = await imageFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate file size
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw data(
      { error: `Image file too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB` },
      { status: 400 },
    );
  }

  // Validate content type
  if (!ALLOWED_TYPES.includes(imageFile.type)) {
    throw data(
      { error: `Invalid image type. Allowed types: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  // Get image dimensions
  const { width, height } = await getImageDimensions(buffer);

  // Validate dimensions
  if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) {
    throw data(
      {
        error: `Image too small. Minimum size is ${MIN_IMAGE_SIZE}x${MIN_IMAGE_SIZE}px`,
        details: { width, height },
      },
      { status: 400 },
    );
  }

  // Calculate hash for deduplication
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  // Check if image already exists
  let coverImage = await prisma.coverImage.findUnique({
    where: { contentHash },
  });

  if (!coverImage) {
    // Upload to storage
    const fileId = createId();
    const extension = imageFile.type.split("/")[1] || "jpg";
    const timestamp = Date.now();
    const objectKey = `images/${entityType}s/${entityId}/${timestamp}-${fileId}.${extension}`;

    await uploadFile({
      file: buffer,
      key: objectKey,
      contentType: imageFile.type,
    });

    // Create CoverImage record
    coverImage = await prisma.coverImage.create({
      data: {
        contentHash,
        objectKey,
        width,
        height,
        format: extension,
        fileSize: buffer.length,
        isPrimary: false, // Will be set separately via set-primary endpoint
      },
    });
  }

  return data({
    success: true,
    image: {
      id: coverImage.id,
      objectKey: coverImage.objectKey,
      width: coverImage.width,
      height: coverImage.height,
      isPrimary: coverImage.isPrimary,
    },
  });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
