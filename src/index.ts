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
import { API_URL, BASE_PATH, PORT } from "./lib/constants.js";
import { setupCronJobs } from "./lib/cron.js";
import { handleErrors } from "./lib/errors.js";
import apiRouter from "./routes/api/router.js";
import testRouter from "./routes/test-generation.router.js";

const log = debug(`${process.env.APP_NAME}:index.ts`);

const app = express();

// Auth
const config = {
	// TODO: fill in
	clientId: "67671606740d4f899d4e371666a9446c",
	secret: "QRJ9ruVymupqkC6hSPlA7OpyahaAhLSOlXoyLis9aPOqvMDxDJbu",
	issuerBaseUrl: "https://yats-development.us.kinde.com",
	siteUrl: "http://localhost:8080",
	redirectUrl: "http://localhost:8080",
	scope: "openid profile email",
	grantType: GrantType.AUTHORIZATION_CODE, //or CLIENT_CREDENTIALS or PKCE
	unAuthorisedUrl: "http://localhost:8080/unauthorised",
	postLogoutRedirectUrl: "http://localhost:8080",
};

// Environments
// Link to this section
// As part of your development process, we highly recommend you create a development environment within your Kinde account. In this case, you’d use the Environment subdomain and app key values in the code block above.

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

app.get("/health", (_, res) => {
	res
		.status(200)
		.json({ message: "OK - Server is up and running", status: "OK" });
});

app.use("/test", testRouter);
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

export { app };
