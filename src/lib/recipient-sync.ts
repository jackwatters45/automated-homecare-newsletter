import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
import { syncRecipients } from "../api/service.js";
import logger from "../lib/logger.js";
import type { RecipientFromEpic } from "../types/index.js";
import { BASE_UPLOAD_DIR } from "./constants.js";
import { AppError } from "./errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProcessingResult {
	processedUsers: RecipientFromEpic[];
}

interface WorkerMessage {
	type: "complete" | "error";
	results?: ProcessingResult;
	error?: string;
}

export async function handleFileChunk(
	filePath: string,
	chunkIndex: number,
	originalFilename: string,
): Promise<void> {
	const chunksDir = path.join(BASE_UPLOAD_DIR, "chunks", originalFilename);
	logger.info(`Handling chunk ${chunkIndex} for ${originalFilename}`);
	logger.info(`Current working directory: ${process.cwd()}`);
	logger.info(`Chunks directory: ${chunksDir}`);
	logger.info(`Original file path: ${filePath}`);

	try {
		await fsPromises.mkdir(chunksDir, { recursive: true });
		logger.info(`Created chunks directory: ${chunksDir}`);

		const chunkPath = path.join(chunksDir, `chunk-${chunkIndex}`);
		logger.info(`Attempting to move file from ${filePath} to ${chunkPath}`);

		// Check if the source file exists
		if (
			await fsPromises
				.access(filePath)
				.then(() => true)
				.catch(() => false)
		) {
			await fsPromises.rename(filePath, chunkPath);
			logger.info(`Successfully moved chunk to ${chunkPath}`);
		} else {
			logger.error(`Source file not found: ${filePath}`);
			throw new Error(`Source file not found: ${filePath}`);
		}

		// List contents of chunks directory
		const files = await fsPromises.readdir(chunksDir);
		logger.info(`Contents of ${chunksDir}:`, files);
	} catch (error) {
		logger.error(`Error handling file chunk: ${error}`);
		throw error;
	}
}

async function transpileWorker(filePath: string): Promise<string> {
	const result = await build({
		entryPoints: [filePath],
		bundle: true,
		write: false,
		format: "cjs",
		target: "node14",
		platform: "node",
	});

	if (result.outputFiles && result.outputFiles.length > 0) {
		return result.outputFiles[0].text;
	}

	throw new Error("Failed to transpile worker");
}

function runWorkerWithTimeout(
	workerCode: string,
	workerData: unknown,
	timeoutMs = 300000,
): Promise<ProcessingResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(workerCode, { eval: true, workerData });

		const timeoutId = setTimeout(() => {
			worker.terminate();
			logger.error("Worker timed out");
			reject(new Error("Worker timed out"));
		}, timeoutMs);

		worker.on("message", async (message: WorkerMessage) => {
			clearTimeout(timeoutId);
			if (message.type === "complete" && message.results) {
				await syncRecipients(message.results.processedUsers);
				resolve(message.results);
			} else {
				logger.error(`Worker Message Error: ${message.error}`);
				reject(new Error(message.error || "Unknown worker error"));
			}
		});

		worker.on("error", (error) => {
			clearTimeout(timeoutId);
			logger.error("Worker error:", error);
			reject(error);
		});

		worker.on("exit", (code) => {
			clearTimeout(timeoutId);
			if (code !== 0) {
				logger.error(`Worker stopped with exit code ${code}`);
				reject(new Error(`Worker stopped with exit code ${code}`));
			}
		});
	});
}

async function cleanupTempFiles(
	sanitizedFilename: string,
	chunksDir: string,
	fullFilePath: string,
) {
	logger.info(`Starting cleanup for ${sanitizedFilename}`);
	logger.info(`Chunks directory: ${chunksDir}`);
	logger.info(`Full file path: ${fullFilePath}`);

	try {
		// Check if chunks directory exists
		if (
			await fsPromises
				.access(chunksDir)
				.then(() => true)
				.catch(() => false)
		) {
			logger.info(`Chunks directory exists: ${chunksDir}`);
			// Remove chunk files
			const chunkFiles = await fsPromises.readdir(chunksDir);
			logger.info(`Found ${chunkFiles.length} chunk files at ${chunksDir}`);
			for (const chunkFile of chunkFiles) {
				const chunkPath = path.join(chunksDir, chunkFile);
				await fsPromises
					.unlink(chunkPath)
					.catch((err) =>
						logger.error(`Failed to delete chunk file ${chunkPath}:`, err),
					);
			}

			// Remove chunks directory
			await fsPromises
				.rmdir(chunksDir)
				.catch((err) =>
					logger.error(`Failed to remove chunks directory ${chunksDir}:`, err),
				);
		} else {
			logger.info(`Chunks directory does not exist: ${chunksDir}`);
		}

		// Check if full file exists before attempting to remove
		if (
			await fsPromises
				.access(fullFilePath)
				.then(() => true)
				.catch(() => false)
		) {
			logger.info(`Full file exists: ${fullFilePath}`);
			// Remove the full processed file
			await fsPromises
				.unlink(fullFilePath)
				.catch((err) =>
					logger.error(`Failed to delete full file ${fullFilePath}:`, err),
				);
		} else {
			logger.info(`Full file does not exist: ${fullFilePath}`);
		}

		logger.info(`Cleanup completed for ${sanitizedFilename}`);
	} catch (error) {
		logger.error(`Error during cleanup for ${sanitizedFilename}:`, error);
	}
}

export async function processCompleteFile(
	fileName: string,
	totalChunks: number,
): Promise<ProcessingResult> {
	const chunksDir = path.join(BASE_UPLOAD_DIR, "chunks", fileName);
	const fullFilePath = path.join(BASE_UPLOAD_DIR, fileName);

	logger.info(`Processing complete file: ${fullFilePath}`);
	logger.info(`Chunks directory: ${chunksDir}`);
	logger.info(`Total chunks: ${totalChunks}`);

	try {
		// Ensure the chunks directory exists
		await fsPromises.mkdir(chunksDir, { recursive: true });

		// List contents of chunks directory before combining
		const filesBeforeCombine = await fsPromises.readdir(chunksDir);

		// Check if the number of chunks matches the expected number
		if (filesBeforeCombine.length !== totalChunks) {
			throw new AppError(
				`Expected ${totalChunks} chunks, but found ${filesBeforeCombine.length}`,
			);
		}

		if (totalChunks === 1) {
			const singleChunkPath = path.join(chunksDir, "chunk-0");
			if (
				await fsPromises
					.access(singleChunkPath)
					.then(() => true)
					.catch(() => false)
			) {
				// If the chunk is still in the chunks directory, rename it
				await fsPromises.rename(singleChunkPath, fullFilePath);
				logger.info(
					`Renamed single file chunk: ${singleChunkPath} to ${fullFilePath}`,
				);
			} else {
				throw new Error(`Cannot find single chunk file at ${singleChunkPath}`);
			}
		} else {
			await combineChunks(chunksDir, fullFilePath, totalChunks);
			logger.info(`Successfully combined chunks into ${fullFilePath}`);
		}

		// Verify the final file exists
		if (
			await fsPromises
				.access(fullFilePath)
				.then(() => true)
				.catch(() => false)
		) {
			logger.info(`Final file exists at: ${fullFilePath}`);
		} else {
			throw new Error(`Final file not found at ${fullFilePath}`);
		}

		// Process the file with the worker
		const workerPath = path.resolve(__dirname, "csv-processor.ts");

		if (
			!(await fsPromises
				.access(workerPath)
				.then(() => true)
				.catch(() => false))
		) {
			logger.error(`Worker file not found at ${workerPath}`);
			throw new Error("CSV processor worker not found");
		}

		const transpiledCode = await transpileWorker(workerPath);
		const result = await runWorkerWithTimeout(
			transpiledCode,
			{ filePath: fullFilePath, fileName: fileName },
			180000, // 3 minutes timeout
		);

		logger.info("Worker processing completed successfully");

		// Cleanup after successful processing
		await cleanupTempFiles(fileName, chunksDir, fullFilePath);

		return result;
	} catch (error) {
		logger.error(`Error processing complete file: ${error}`);
		// Attempt cleanup even if an error occurred
		await cleanupTempFiles(fileName, chunksDir, fullFilePath);
		throw error;
	}
}

async function combineChunks(
	chunksDir: string,
	outputPath: string,
	totalChunks: number,
) {
	logger.info(`Combining chunks from ${chunksDir} to ${outputPath}`);
	logger.info(`Total chunks to combine: ${totalChunks}`);

	const writeStream = fs.createWriteStream(outputPath);

	for (let i = 0; i < totalChunks; i++) {
		const chunkPath = path.join(chunksDir, `chunk-${i}`);
		logger.info(`Processing chunk: ${chunkPath}`);

		try {
			const chunkContents = await fsPromises.readFile(chunkPath);
			logger.info(`Read chunk ${i}, size: ${chunkContents.length} bytes`);

			writeStream.write(chunkContents);
			logger.info(`Wrote chunk ${i} to output file`);

			await fsPromises.unlink(chunkPath);
			logger.info(`Deleted chunk file: ${chunkPath}`);
		} catch (error) {
			logger.error(`Error processing chunk ${i}:`, error);
			throw error;
		}
	}

	await new Promise<void>((resolve) => writeStream.end(resolve));
	logger.info(`Finished writing to output file: ${outputPath}`);
}
