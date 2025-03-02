import { Router } from "express";
import { handleCyberRequest ,recieveTextFromFrontend} from "../controllers/cybercrime.controller.js";

const router = Router();

router.post("/", handleCyberRequest);
router.post("/receive", recieveTextFromFrontend);

export default router;
