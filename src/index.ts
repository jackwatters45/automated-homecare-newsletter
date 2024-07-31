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
import apiRouter from "./api/router.js";
import { API_URL, BASE_PATH, PORT } from "./lib/constants.js";
import { setupCronJobs } from "./lib/cron.js";

import { authMiddleware } from "./lib/auth-middleware.js";
import { handleErrors } from "./lib/errors.js";
import { healthCheck } from "./lib/health.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();

// Middleware
app.use(helmet());
app.use(compression());

const allowedOrigins = ["https://trollycare-newsletter.vercel.app"];
const corsOptions = {
	origin: (
		origin: string | undefined,
		callback: (err: Error | null, allow?: boolean) => void,
	) => {
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error("Not allowed by CORS"));
		}
	},
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(
	path.join(BASE_PATH, "access.log"),
	{ flags: "a" },
);

// Setup the logger
app.use(morgan("combined", { stream: accessLogStream }));

// Set up view engine
app.engine("hbs", engine({ extname: "hbs", defaultLayout: false }));
app.set("view engine", "hbs");
app.set("views", path.join(BASE_PATH, "public", "views"));

// Rate limiting
const limiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 50,
});
app.use(limiter);

app.use(express.static(path.join(BASE_PATH, "public")));

app.get("/", (_, res) => res.redirect("/health"));

app.get("/health", healthCheck);

app.use("/api", authMiddleware, apiRouter);

// Setup cron jobs
setupCronJobs();

// Error handling
Sentry.setupExpressErrorHandler(app);

app.use(handleErrors);

// Start the server
app.listen(PORT, () => {
	const message = `Server is running at ${API_URL}`;
	log(message);
});
