import { Router } from "express";
import { overview } from "../controllers/adminController.js";
import { requireAdmin, requireUser } from "../middleware/auth.js";

const router = Router();

router.get("/overview", requireUser, requireAdmin, overview);

export default router;
