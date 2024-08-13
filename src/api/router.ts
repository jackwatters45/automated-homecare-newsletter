import express from "express";
import {
	articleController,
	newsletterController,
	pagesController,
	recipientController,
} from "./controller.js";

const router = express.Router();

// Newsletter Routes
router.get("/newsletters", newsletterController.getAll);
router.get(
	"/newsletters/with-recipients",
	newsletterController.getAllWithRecipients,
);
router.get("/newsletters/:id", newsletterController.getOne);
router.post("/newsletters", newsletterController.create);
router.patch("/newsletters/:id/summary", newsletterController.updateSummary);
router.delete("/newsletters/:id", newsletterController.delete);
router.post("/newsletters/generate", newsletterController.generate);
router.post("/newsletters/review", newsletterController.review);
router.post("/newsletters/:id/send", newsletterController.send);

// Article Routes
router.patch("/articles/:id/description", articleController.updateDescription);
router.post("/articles", articleController.create);
router.delete("/articles/:id", articleController.delete);

// Recipient Routes
router.get("/recipients", recipientController.getAll);
router.post("/recipients/:id", recipientController.addRecipient);
router.delete("/recipients/:id", recipientController.deleteRecipient);

// Page Routes
router.get("/page/generate", pagesController.renderGenerateButton);
router.get("/page/newsletter/:id", pagesController.renderNewsletterPreview);

export default router;
