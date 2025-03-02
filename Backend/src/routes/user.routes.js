import { Router } from "express";
import { registerUser,loginUser, logoutUser,sendOtpForRegistration } from "../controllers/user.controller.js";
// import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";


const router = Router()

router.route("/login").post(
    loginUser
) 

router.route("/register").post(
    registerUser
)

router.route("/send-otp").post(
    sendOtpForRegistration
)
router.route("/logout").post(
    verifyJWT,
    logoutUser
)


export default router