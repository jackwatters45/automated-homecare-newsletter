import "dotenv/config";
import "module-alias/register";
import "@/lib/instrument";

import path from "node:path";
import * as Sentry from "@sentry/node";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { GenerateNewsletter, generateNewsletterData } from "@/app";
import { runWeekly } from "@/lib/cron";
import { retry } from "@/lib/utils";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 50,
});
app.use(limiter);

class HttpException extends Error {
	errorCode: number;
	constructor(
		errorCode: number,
		public readonly message: string,
	) {
		super(message);
		this.errorCode = errorCode;
	}
}

app.use(express.static(path.join(path.resolve(), "public")));

// API routes
app.post("/generate-newsletter-data", async (_, res) => {
	try {
		const result = await retry(generateNewsletterData);
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: "Failed to generate newsletter data" });
	}
});

app.post("/generate-newsletter", async (_, res) => {
	try {
		const result = await retry(GenerateNewsletter);
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: "Failed to generate newsletter" });
	}
});

app.get("/run-weekly", (_, res) => {
	runWeekly(async () => {
		try {
			await retry(GenerateNewsletter);
		} catch (error) {
			console.error("Error in weekly run:", error);
		}
	});
	res.json({ message: "Weekly task scheduled" });
});

// TODO test -> delete
app.get("/debug-sentry", function mainHandler(req, res) {
	throw new Error("My first Sentry error!");
});

app.get("/", function mainHandler(req, res) {
	res.send("Hello World!");
});

// Error handling
Sentry.setupExpressErrorHandler(app);

app.use(
	(
		err: Error | HttpException,
		req: express.Request,
		res: express.Response,
		next: express.NextFunction,
	) => {
		if (err instanceof HttpException) {
			return res.status(err.errorCode).json(err.message);
		}
		res.status(500).json(err.message);
	},
);

// Start the server
app.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});

// Keep the main function for potential CLI usage
async function main() {
	runWeekly(async () => {
		try {
			await retry(GenerateNewsletter);
		} catch (error) {
			console.error("Error in main function:", error);
		}
	});
}

// This can be used if you want to run the script directly
if (require.main === module) {
	retry(main).catch((error) => {
		console.error("Unhandled error in main script:", error);
		process.exit(1);
	});
}

export { app };
