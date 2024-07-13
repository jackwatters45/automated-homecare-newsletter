import express from "express";
import { articleController, newsletterController } from "./controller.js";

const router = express.Router();

// Newsletter Routes
router.get("/newsletters", newsletterController.getAll);
router.get("/newsletters/:id", newsletterController.getOne);
router.post("/newsletters", newsletterController.create);
router.patch("/newsletters/:id/summary", newsletterController.updateSummary);
router.delete("/newsletters/:id", newsletterController.delete);

// Article Routes
router.patch("/articles/:id/description", articleController.updateDescription);

export default router;
