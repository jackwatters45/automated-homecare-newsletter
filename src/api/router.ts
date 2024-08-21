import express from "express";
import {
	adController,
	articleController,
	newsletterController,
	pagesController,
	recipientController,
	reviewerController,
} from "./controller.js";

const router = express.Router();

// Newsletter Routes
router.get("/newsletters/frequency", newsletterController.getFrequency);
router.get(
	"/newsletters/with-recipients",
	newsletterController.getAllWithRecipients,
);
router.get("/newsletters/:id", newsletterController.getOne);
router.get("/newsletters", newsletterController.getAll);

router.post("/newsletters/generate", newsletterController.generate);
router.post("/newsletters/review", newsletterController.review);
router.post("/newsletters/:id/review", newsletterController.reviewById);
router.post("/newsletters/:id/send", newsletterController.send);
router.post("/newsletters", newsletterController.create);

router.patch(
	"/newsletters/:id/update-order",
	newsletterController.updateArticleOrder,
);
router.patch(
	"/newsletters/:id/update-category/:articleId",
	newsletterController.updateArticleCategory,
);
router.patch("/newsletters/:id/summary", newsletterController.updateSummary);

router.put("/newsletters/frequency", newsletterController.updateFrequency);

router.delete("/newsletters/:id", newsletterController.delete);

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

// Reviewer Routes
router.get("/reviewers", reviewerController.getAll);
router.delete("/reviewers/all", reviewerController.removeAll);
router.delete("/reviewers/:id", reviewerController.deleteReviewer);
router.post("/reviewers/bulk", reviewerController.addBulk);
router.post("/reviewers/:id", reviewerController.addReviewer);

// Ad Routes
router.get("/ads", adController.getAllAds);
router.get("/ads/:id", adController.getAdById);
router.post("/ads", adController.createAd);
router.put("/ads/:id", adController.updateAd);
router.delete("/ads/:id", adController.deleteAd);
router.post(
	"/ads/:adId/newsletters/:newsletterId",
	adController.addAdToNewsletter,
);
router.delete(
	"/ads/:adId/newsletters/:newsletterId",
	adController.removeAdFromNewsletter,
);

export default router;
