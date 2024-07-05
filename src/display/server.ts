import "dotenv/config";

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";
import express from "express";
import { engine } from "express-handlebars";

const log = debug(`${process.env.APP_NAME}:server.ts`);

const app = express();
const port = process.env.PORT ?? 3000;

const basepath = path.resolve();

app.engine("hbs", engine({ extname: "hbs", defaultLayout: false }));
app.set("view engine", "hbs");
app.set("views", path.join(basepath, "src", "views"));

async function startServer() {
	const articlesJson = await fs.readFile(
		path.join(basepath, "tests", "data", "display-article-data.json"),
		"utf8",
	);
	const articles = JSON.parse(articlesJson);

	app.get("/", (_, res) => {
		res.render("newsletter", { articles });
	});

	// Start the server
	app.listen(port, () => {
		log(`Server is running on http://localhost:${port}`);
	});
}

startServer();
