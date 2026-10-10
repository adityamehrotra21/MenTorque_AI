import { Router } from "express";
import {
  completeInterview,
  createInterview,
  getInterview,
  listInterviews,
  respond,
} from "../controllers/interviewController.js";
import { requireUser } from "../middleware/auth.js";

const router = Router();

router.use(requireUser);
router.get("/", listInterviews);
router.post("/", createInterview);
router.get("/:id", getInterview);
router.post("/:id/respond", respond);
router.post("/:id/complete", completeInterview);

export default router;
