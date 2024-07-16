import express from "express";
import {
	articleController,
	newsletterController,
	recipientController,
} from "./controller.js";

const router = express.Router();

// Newsletter Routes
router.get("/newsletters", newsletterController.getAll);
router.get("/newsletters/:id", newsletterController.getOne);
router.post("/newsletters", newsletterController.create);
router.patch("/newsletters/:id/summary", newsletterController.updateSummary);
router.delete("/newsletters/:id", newsletterController.delete);

router.post("/newsletters/generate", newsletterController.generate);
router.post("/newsletters/:id/send", newsletterController.send);

// Article Routes
router.patch("/articles/:id/description", articleController.updateDescription);
router.delete("/articles/:id", articleController.delete);

// Recipient Routes
router.get("/recipients", recipientController.getAll);
router.post("/recipients/:id", recipientController.addRecipient);
router.delete("/recipients/:id", recipientController.deleteRecipient);

export default router;
