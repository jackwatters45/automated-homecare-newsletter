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
router.post("/newsletters", newsletterController.create);
router.post("/newsletters/generate", newsletterController.generate);
router.post("/newsletters/review", newsletterController.review);
router.get("/newsletters/frequency", newsletterController.getFrequency);
router.put("/newsletters/frequency", newsletterController.updateFrequency);
router.get("/newsletters/:id", newsletterController.getOne);
router.patch("/newsletters/:id/summary", newsletterController.updateSummary);
router.delete("/newsletters/:id", newsletterController.delete);
router.post("/newsletters/:id/send", newsletterController.send);

// Article Routes
router.patch("/articles/:id/description", articleController.updateDescription);
router.post("/articles", articleController.create);
router.delete("/articles/:id", articleController.delete);

// Recipient Routes
router.get("/recipients", recipientController.getAll);
router.delete("/recipients/all", recipientController.removeAll);
router.delete("/recipients/:id", recipientController.deleteRecipient);
router.post("/recipients/bulk", recipientController.addBulk);
router.post("/recipients/:id", recipientController.addRecipient);

// Page Routes
router.get("/page/generate", pagesController.renderGenerateButton);
router.get("/page/newsletter/:id", pagesController.renderNewsletterPreview);

export default router;
