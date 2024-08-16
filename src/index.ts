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
import { authMiddleware } from "./lib/auth-middleware.js";
import { API_URL, BASE_PATH, IS_DEVELOPMENT, PORT } from "./lib/constants.js";
import { setupCronJobs } from "./lib/cron.js";
import { handleErrors } from "./lib/errors.js";
import { healthCheck } from "./lib/health.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();

const allowedOrigins = ["https://trollycare-newsletter.vercel.app"];

// Middleware
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", "'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "https:"],
				connectSrc: ["'self'", ...allowedOrigins],
			},
		},
		referrerPolicy: {
			policy: "strict-origin-when-cross-origin",
		},
	}),
);
app.use(compression());

const corsOptions: cors.CorsOptions = {
	origin: (
		origin: string | undefined,
		callback: (err: Error | null, allow?: boolean) => void,
	) => {
		if (!origin) {
			// Allow requests with no origin (like mobile apps or curl requests)
			callback(null, true);
		} else if (IS_DEVELOPMENT && origin.startsWith("http://localhost")) {
			// Allow any localhost origin in development mode
			callback(null, true);
		} else if (allowedOrigins.includes(origin)) {
			// Allow specific origins
			callback(null, true);
		} else {
			log(IS_DEVELOPMENT);
			log(origin.startsWith("http://localhost"));

			log(`CORS error: Origin ${origin} not allowed`);
			callback(new Error("Not allowed by CORS"));
		}
	},
	methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "baggage", "sentry-trace"],
	credentials: true,
	optionsSuccessStatus: 204,
	maxAge: 3600,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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

// Trust proxy
app.set("trust proxy", 1);

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
