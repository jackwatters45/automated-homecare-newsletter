import path from "node:path";
import { z } from "zod";

// Define the schema for file input validation
export const FileInputSchema = z.object({
	originalFilename: z.string().regex(/^[a-zA-Z0-9_-]+\.csv$/),
	chunkIndex: z.number().int().nonnegative(),
	totalChunks: z.number().int().positive(),
});

export type FileInput = z.infer<typeof FileInputSchema>;

export function sanitizeFilePath(
	filePath: string,
	removeExtension = false,
): string {
	const normalizedPath = path
		.normalize(filePath)
		.replace(/^(\.\.(\/|\\|$))+/, "");

	// remove extension if specified
	if (removeExtension) {
		return path.basename(normalizedPath, path.extname(normalizedPath));
	}

	return path.join(normalizedPath);
}

// Email Schema
export const emailSchema = z
	.string()
	.email()
	.transform((email) => decodeURIComponent(email));
