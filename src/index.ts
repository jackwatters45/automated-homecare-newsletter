import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { GrantType, setupKinde } from "@kinde-oss/kinde-node-express";
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
import { getEnvVariables } from "./lib/env.js";
import { handleErrors } from "./lib/errors.js";
import { healthCheck } from "./lib/health.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();

const env = getEnvVariables();

// Auth
const config = {
	clientId: env.KINDE_CLIENT_ID,
	secret: env.KINDE_CLIENT_SECRET,
	issuerBaseUrl: env.KINDE_BASE_URL,
	siteUrl: env.BASE_URL,
	redirectUrl: env.BASE_URL,
	scope: "openid profile email",
	grantType: GrantType.AUTHORIZATION_CODE,
	unAuthorisedUrl: `${env.BASE_URL}/unauthorised`,
	postLogoutRedirectUrl: env.BASE_URL,
};

setupKinde(config, app);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
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

app.get("/", (_, res) => {
	res.redirect("/health");
});

app.get("/health", healthCheck);

app.use("/api", apiRouter);

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
