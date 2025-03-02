const otpStore = new Map(); // Temporary store (use Redis for production)

/**
 * Generate OTP and store it temporarily (expires in 5 minutes)
 */
export const generateOtp = (mobile) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(mobile, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    return otp;
};

/**
 * Verify OTP and delete it after use
 */
export const verifyOtp = (mobile, otp) => {
    const storedOtp = otpStore.get(mobile);
    if (!storedOtp) return false;
    if (storedOtp.otp !== otp || Date.now() > storedOtp.expiresAt) {
        otpStore.delete(mobile);
        return false;
    }
    otpStore.delete(mobile); // Remove OTP after successful verification
    return true;
};
