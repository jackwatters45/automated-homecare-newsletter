import express from "express";
import {
	adController,
	articleController,
	blacklistedDomainController,
	newsletterController,
	pagesController,
	recipientController,
	reviewerController,
	subscriptionController,
} from "./controller.js";

export const apiRouter = express.Router();

// Newsletter Routes
apiRouter.get("/newsletters/frequency", newsletterController.getFrequency);
apiRouter.get(
	"/newsletters/with-recipients",
	newsletterController.getAllWithRecipients,
);
apiRouter.get("/newsletters", newsletterController.getAll);
apiRouter.get("/newsletters/unsent", newsletterController.getAllUnsent);
apiRouter.get("/newsletters/:id", newsletterController.getOne);

apiRouter.post("/newsletters/generate", newsletterController.generate);
apiRouter.post("/newsletters/review", newsletterController.review);
apiRouter.post("/newsletters/:id/review", newsletterController.reviewById);
apiRouter.post("/newsletters/:id/send", newsletterController.send);
apiRouter.post("/newsletters", newsletterController.create);

apiRouter.patch(
	"/newsletters/:id/update-order",
	newsletterController.updateArticleOrder,
);
apiRouter.patch(
	"/newsletters/:id/update-category/:articleId",
	newsletterController.updateArticleCategory,
);
apiRouter.patch("/newsletters/:id/summary", newsletterController.updateSummary);

apiRouter.put("/newsletters/frequency", newsletterController.updateFrequency);

apiRouter.delete("/newsletters/:id", newsletterController.delete);

// Article Routes
apiRouter.patch(
	"/articles/:id/description",
	articleController.updateDescription,
);
apiRouter.post("/articles", articleController.create);
apiRouter.delete("/articles/:id", articleController.delete);

// Recipient Routes
apiRouter.get("/recipients", recipientController.getAll);
apiRouter.delete("/recipients/all", recipientController.removeAll);
apiRouter.delete("/recipients/:id", recipientController.deleteRecipient);
apiRouter.post("/recipients/bulk", recipientController.addBulk);
apiRouter.post("/recipients/:id", recipientController.addRecipient);

// Page Routes
apiRouter.get("/page/generate", pagesController.renderGenerateButton);
apiRouter.get("/page/newsletter/:id", pagesController.renderNewsletterPreview);

// Reviewer Routes
apiRouter.get("/reviewers", reviewerController.getAll);
apiRouter.delete("/reviewers/all", reviewerController.removeAll);
apiRouter.delete("/reviewers/:id", reviewerController.deleteReviewer);
apiRouter.post("/reviewers/bulk", reviewerController.addBulk);
apiRouter.post("/reviewers/:id", reviewerController.addReviewer);

// Blacklisted Domains Routes
apiRouter.get("/blacklisted-domains", blacklistedDomainController.getAll);
apiRouter.get(
	"/blacklisted-domains/external",
	blacklistedDomainController.getAllExternal,
);
apiRouter.delete(
	"/blacklisted-domains/all",
	blacklistedDomainController.removeAll,
);
apiRouter.delete(
	"/blacklisted-domains/:id",
	blacklistedDomainController.deleteDomain,
);
apiRouter.post(
	"/blacklisted-domains/bulk",
	blacklistedDomainController.addBulk,
);
apiRouter.post(
	"/blacklisted-domains/:id",
	blacklistedDomainController.addDomain,
);

// Ad Routes
apiRouter.get("/ads", adController.getAllAds);
apiRouter.get("/ads/:id", adController.getAdById);
apiRouter.post("/ads", adController.createAd);
apiRouter.put("/ads/:id", adController.updateAd);
apiRouter.delete("/ads/:id", adController.deleteAd);
apiRouter.post(
	"/ads/:adId/newsletters/:newsletterId",
	adController.addAdToNewsletter,
);
apiRouter.delete(
	"/ads/:adId/newsletters/:newsletterId",
	adController.removeAdFromNewsletter,
);

export const subscriptionRouter = express.Router();

// Subscription Routes
subscriptionRouter.post(
	"/subscribe/:id",
	subscriptionController.addSubscription,
);
subscriptionRouter.delete(
	"/unsubscribe/:id",
	subscriptionController.removeSubscription,
);
