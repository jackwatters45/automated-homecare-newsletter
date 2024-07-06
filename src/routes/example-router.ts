import path from "node:path";
import debug from "debug";
import express from "express";
import { generateNewsletterData } from "../app/index.js";
import type { ArticleDisplayData } from "../types/index.js";

const router = express.Router();
const log = debug(`${process.env.APP_NAME}:example-router`);
const basepath = path.resolve();

let data: ArticleDisplayData[] = [];

router.get("/", (req, res) => {
	log("GET /example");
	res.sendFile(path.join(basepath, "public", "test.html"));
});

router.get("/generate", async (req, res) => {
	log("GET /example/generate");
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

router.get("/newsletter", async (req, res) => {
	log("GET /example/newsletter");
	try {
		res.render("newsletter", { articles: data });
	} catch (error) {
		res.status(500).send("Error rendering newsletter");
	}
});

export default router;
// import "dotenv/config";

// import express from "express";
// import { engine } from "express-handlebars";

// import path from "node:path";
// import debug from "debug";
// import { generateNewsletterData } from "../app/index.js";
// import type { ArticleDisplayData } from "../types/index.js";

// const log = debug(`${process.env.APP_NAME}:generate-example.ts`);

// const app = express();
// const port = 8080;

// const basepath = path.resolve();

// app.engine("hbs", engine({ extname: "hbs", defaultLayout: false }));
// app.set("view engine", "hbs");
// app.set("views", path.join(basepath, "src", "views"));

// // Serve static files
// app.use(express.static("public"));

// // Route for the main page
// app.get("example/", (_, res) => {
// 	log("GET /");

// 	res.sendFile(path.join(basepath, "public", "test.html"));
// });

// let data: ArticleDisplayData[] = [];

// // Route to generate data
// app.get("example/generate", async (_, res) => {
// 	log("GET /generate");
// 	try {
// 		data = (await generateNewsletterData()) ?? [];

// 		res.json({ success: true, message: "Data generated successfully" });
// 	} catch (error) {
// 		res.status(500).json({
// 			success: false,
// 			message: `Error generating data${JSON.stringify(error)}`,
// 		});
// 	}
// });

// // Route to render the newsletter
// app.get("example/newsletter", async (_, res) => {
// 	log("GET /newsletter");

// 	try {
// 		res.render("newsletter", { articles: data });
// 	} catch (error) {
// 		res.status(500).send("Error rendering newsletter");
// 	}
// });

// app.listen(port, () => {
// 	log(`Server running at http://localhost:${port}`);
// });
