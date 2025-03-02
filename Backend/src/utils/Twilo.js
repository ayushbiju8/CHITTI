import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

/**
 * Send OTP using Twilio
 */
export const sendOtp = async (mobile, otp) => {
    try {
        await client.messages.create({
            body: `Your verification OTP is: ${otp}`,
            from: twilioPhone,
            to: `+91${mobile}`, // Adjust country code if needed
        });
    } catch (error) {
        console.error("Error sending OTP:", error);
        throw new Error("Failed to send OTP");
    }
};
