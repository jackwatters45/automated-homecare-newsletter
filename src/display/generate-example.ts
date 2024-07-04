import "dotenv/config";

import express from "express";
import { engine } from "express-handlebars";

import path from "node:path";
import { generateNewsletterData } from "@/app/index";
import debug from "debug";
import type { ArticleDisplayData } from "types";

const log = debug(`${process.env.APP_NAME}:generate-example.ts`);

const app = express();
const port = 3000;

const basepath = path.resolve();

app.engine("hbs", engine({ extname: "hbs", defaultLayout: false }));
app.set("view engine", "hbs");
app.set("views", path.join(basepath, "src", "views"));

// Serve static files
app.use(express.static("public"));

// Route for the main page
app.get("/", (_, res) => {
	log("GET /");

	res.sendFile(path.join(basepath, "public", "test.html"));
});

let data: ArticleDisplayData[] = [];

// Route to generate data
app.get("/generate", async (_, res) => {
	log("GET /generate");
	try {
		data = (await generateNewsletterData()) ?? [];

		res.json({ success: true, message: "Data generated successfully" });
	} catch (error) {
		res.status(500).json({
			success: false,
			message: `Error generating data${JSON.stringify(error)}`,
		});
	}
});

// Route to render the newsletter
app.get("/newsletter", async (_, res) => {
	log("GET /newsletter");

	try {
		res.render("newsletter", { articles: data });
	} catch (error) {
		res.status(500).send("Error rendering newsletter");
	}
});

app.listen(port, () => {
	log(`Server running at http://localhost:${port}`);
});
