import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import * as Sentry from "@sentry/node";
import compression from "compression";
import cors from "cors";
import debug from "debug";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { engine } from "express-handlebars";
import { GenerateNewsletter, generateNewsletterData } from "./app/index.js";
import { API_URL, PORT } from "./lib/constants.js";
import { setupCronJobs } from "./lib/cron.js";
import { handleErrors } from "./lib/errors.js";
import { retry } from "./lib/utils.js";
import exampleRouter from "./routes/example-router.js";
import serverRouter from "./routes/server.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(
	path.join(__dirname, "access.log"),
	{ flags: "a" },
);

// Setup the logger
app.use(morgan("combined", { stream: accessLogStream }));

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

app.get("/", (_, res) => {
	res.redirect("/health");
});

app.get("/health", (_, res) => {
	res
		.status(200)
		.json({ message: "OK - Server is up and running", status: "OK" });
});

app.use("/example", exampleRouter);
app.use("/server", serverRouter);

// Setup cron jobs
setupCronJobs();

// Error handling
Sentry.setupExpressErrorHandler(app);

app.use(handleErrors);

// Start the server
app.listen(PORT, () => {
	const message = `Server is running at ${API_URL}`;
	console.log(message);
	log(message);
});

export { app };
