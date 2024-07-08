import "dotenv/config";

import path from "node:path";
import * as Sentry from "@sentry/node";
import compression from "compression";
import cors from "cors";
import debug from "debug";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import exampleRouter from "./routes/example-router.js";
import serverRouter from "./routes/server.js";

import { engine } from "express-handlebars";
import { GenerateNewsletter, generateNewsletterData } from "./app/index.js";
import { runWeekly } from "./lib/cron.js";
import { retry } from "./lib/utils.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// Set up view engine
app.engine("hbs", engine({ extname: "hbs", defaultLayout: false }));
app.set("view engine", "hbs");
app.set("views", path.join(path.resolve(), "views"));

// Rate limiting
// const limiter = rateLimit({
// 	windowMs: 15 * 60 * 1000, // 15 minutes
// 	max: 50,
// });
// app.use(limiter);

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

app.use("/example", exampleRouter);
app.use("/server", serverRouter);

// TODO test -> delete
app.get("/debug-sentry", (req, res) => {
	throw new Error("My first Sentry error!");
});

app.get("/", (req, res) => {
	console.log("Root route accessed");

	res.status(200).json({ message: "Hello World!" });
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
	const url =
		process.env.NODE_ENV === "production"
			? "automated-homecare-newsletter-production.up.railway.app"
			: `http://localhost:${port}`;

	const message = `Server is running at ${url}`;
	console.log(message);
	log(message);
});

export { app };
