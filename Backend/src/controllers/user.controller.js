import AsyncHandler from "../utils/AsyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { generateOtp, verifyOtp } from "../utils/Otp.js";
import { sendOtp } from "../utils/Twilo.js";


const generateAccessAndRefreshToken = async (userId) => {
    try {
        console.log("User ID:", userId); // Debugging log
        
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        console.log("User found:", user); // Debugging log

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        console.log("Tokens generated successfully"); // Debugging log

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Error in generateAccessAndRefreshToken:", error); // Show the real error
        throw new ApiError(500, error.message || "Something went wrong while generating tokens");
    }
};



const loginUser = AsyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // Secure in production
        sameSite: "Strict",
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully")
        );
});

const logoutUser = AsyncHandler(async (req, res) => {
    // Clear cookies and reset refresh token
    await User.findByIdAndUpdate(
        req.user._id,
        { $set: { refreshToken: undefined } },
        { new: true }
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const sendOtpForRegistration = AsyncHandler(async (req, res) => {
    const { mobile } = req.body;
  
    if (!mobile) {
        throw new ApiError(400, "Mobile number is required");
    }

    const existingUser = await User.findOne({ mobile });

    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }

    // Generate and store OTP
    const otp = generateOtp(mobile);

    // Send OTP via Twilio
    await sendOtp(mobile, otp);

    return res.status(200).json(new ApiResponse(200, null, "OTP sent successfully"));
});

const registerUser = AsyncHandler(async (req, res) => {
    const { email, password, fullName, mobile, otp } = req.body;

    if ([fullName, email, mobile, password, otp].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    // Verify OTP
    const isOtpValid = verifyOtp(mobile, otp);
    if (!isOtpValid) {
        throw new ApiError(400, "Invalid or expired OTP");
    }

    // Check if the user already exists
    const existingUser = await User.findOne({
        $or: [{ email }, { mobile }]
    });

    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }

    // Create new user
    const user = await User.create({ fullName, email, password, mobile });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user");
    }

    return res.status(201).json(new ApiResponse(200, createdUser, "User registered successfully"));
});


export {registerUser,loginUser,logoutUser,sendOtpForRegistration}