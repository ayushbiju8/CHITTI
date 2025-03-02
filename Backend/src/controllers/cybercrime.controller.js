import nodemailer from "nodemailer";
import axios from "axios";
import AsyncHandler from "../utils/AsyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import dotenv from "dotenv";
import { parseXML } from "../utils/xmlParser.js";
dotenv.config();


const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Function to handle cybercrime-related requests
const handleCyberRequest = AsyncHandler(async (req, res) => {
    const { response, data } = req.body;
    console.log(data);
    if (response === undefined || data === undefined) {
        throw new ApiError(400, "Missing required parameters");
    }
    console.log(response);

    if (response === 0) {
        return res.status(200).json({
            status: 200,
            data: data,  // Directly passing request body data
        });
    }


    if (response === 1) {

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: "ayushbiju8@gmail.com", // Replace with actual recipient
            subject: "New Cyber Crime Complaint",
            text: data,
        };

        try {
            let info = await transporter.sendMail(mailOptions);
            return res.json(new ApiResponse(200, { message: "Complaint filed successfully via email!", info, data }));
        } catch (error) {
            throw new ApiError(500, "Failed to send complaint email.", error);
        }
    }


    // Simplified version of the URL scanning code
    if (response === 2) {
        const { url } = data;
        if (!url) {
            console.log("❌ Missing URL for scam check.");
            return res.status(400).json(new ApiResponse(400, null, "Missing URL for scam check."));
        }

        try {
            const apiKey = process.env.VIRUSTOTAL_API_KEY;
            console.log("🔹 API Key loaded.");

            // Step 1: Submit URL for scanning
            console.log(`🔹 Submitting URL for scanning: ${url}`);
            let scanResponse;

            try {
                scanResponse = await axios.post(
                    "https://www.virustotal.com/api/v3/urls",
                    `url=${url}`,
                    {
                        headers: {
                            "x-apikey": apiKey,
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        timeout: 5000
                    }
                );

                if (!scanResponse.data || !scanResponse.data.data || !scanResponse.data.data.id) {
                    console.log("❌ Invalid response from scan submission");
                    return res.status(500).json(new ApiResponse(500, null, "Failed to submit URL for scanning."));
                }

                console.log("✅ URL submitted successfully. Analysis ID:", scanResponse.data.data.id);
            } catch (error) {
                console.error("❌ Error submitting URL for scanning:", error.message);
                return res.status(500).json(new ApiResponse(500, null, "Failed to submit URL for scanning."));
            }

            // Step 2: Retrieve scan results
            const analysisId = scanResponse.data.data.id;
            console.log(`🔹 Retrieving scan results for analysis ID: ${analysisId}`);

            try {
                const resultResponse = await axios.get(
                    `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
                    {
                        headers: {
                            "x-apikey": apiKey
                        },
                        timeout: 5000
                    }
                );

                if (!resultResponse.data?.data?.attributes?.stats) {
                    console.log("❌ Invalid response format from analysis results");
                    return res.status(500).json(new ApiResponse(500, null, "Failed to retrieve scan results."));
                }

                // Process the results
                const stats = resultResponse.data.data.attributes.stats;
                const status = resultResponse.data.data.attributes.status;

                console.log("🔍 Scan results:", stats);
                console.log("🔍 Scan status:", status);

                // If scan is still in progress
                if (status !== "completed") {
                    const resultData = {
                        url,
                        scanId: analysisId,
                        status: status
                    };
                    return res.status(202).json(new ApiResponse(202, resultData, "Scan in progress. Please check back later."));
                }

                // Define threshold for spam determination (you can adjust this)
                const SPAM_THRESHOLD = 3;

                // Simple spam check: if malicious + suspicious count exceeds threshold
                const spamScore = (stats.malicious || 0) + (stats.suspicious || 0);
                const isSpam = spamScore >= SPAM_THRESHOLD;

                const resultData = {
                    url,
                    scanId: analysisId,
                    isSpam: isSpam,
                    spamScore: spamScore,
                    stats: stats
                };

                const message = isSpam ?
                    `URL identified as potentially harmful with score ${spamScore}` :
                    `URL verified as safe with score ${spamScore}`;

                return res.status(200).json(new ApiResponse(200, resultData, message));

            } catch (error) {
                console.error("❌ Error retrieving scan results:", error.message);
                return res.status(500).json(new ApiResponse(500, null, "Failed to retrieve scan results."));
            }
        } catch (error) {
            console.error("❌ Error in spam check:", error.message);
            return res.status(500).json(new ApiResponse(500, null, "Failed to check URL."));
        }
    }

    if (response === 3) {
        const { phone } = data;
        if (!phone) {
            throw new ApiError(400, "Missing phone number for scam check.");
        }

        try {
            // Twilio's Lookup API
            const apiKey = process.env.TWILIO_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;

            const checkPhone = `https://lookups.twilio.com/v1/PhoneNumbers/${phone}?Type=carrier`;
            const result = await axios.get(checkPhone, {
                auth: {
                    username: apiKey,
                    password: authToken,
                },
            });

            const isScam = result.data.carrier.type === "prepaid";
            const message = isScam
                ? "🚨 WARNING: This number is likely a scam!"
                : "✅ Safe: No scam reports found.";

            return res.status(200).json(
                new ApiResponse(200, {
                    phone,
                    carrier: result.data.carrier.name,
                    isScam,
                }, message)
            );
        } catch (error) {
            throw new ApiError(500, "Something went wrong while checking phone scam status.");
        }
    }

    throw new ApiError(400, "Invalid response type.");

});


const recieveTextFromFrontend = AsyncHandler(async (req, res) => {
    const { text } = req.body;
    console.log(text);

    const session_id = "550e8400-e29b-41d4-a716-446655440000"
    if (!text || !session_id) {
        throw new ApiError(400, "Text and session_id are required");
    }

    try {
        // Format the request data
        const requestData = { text, session_id };

        // Make a POST request to the external API
        const response = await axios.post("http://192.168.79.89:7000/analyze-text/", requestData);

        // Return the response in your standard format
        console.log(response.data.data);

        const { resValue, data } = parseXML(response.data.data);

        console.log(resValue); // "0"
        console.log(data);


        if (resValue == 0) {
            return res.status(200).json(
                new ApiResponse(200, {
                    response_type: response.data.response_type,
                    message: response.data.data
                }, "Text analyzed successfully")
            );
        }
        if (resValue == 1) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: "ayushbiju8@gmail.com", // Replace with actual recipient
                subject: "New Cyber Crime Complaint",
                text: data,
            };
            try {
                let info = await transporter.sendMail(mailOptions);
                console.log("Mail sent successfully");
            } catch (error) {
                throw new ApiError(500, "Failed to send complaint email.", error);
            }
            return res.status(200).json(
                new ApiResponse(200, {
                    response_type: response.data.response_type,
                    message: response.data.data
                }, "Text analyzed successfully")
            );
        }
        if (resValue == 2) {
            
        }

    } catch (error) {
        console.error("Error in analyze-text API:", error.message);
        throw new ApiError(500, "Failed to analyze text");
    }
});

export { handleCyberRequest, recieveTextFromFrontend };
























// import nodemailer from "nodemailer";
// import axios from "axios";
// import AsyncHandler from "../utils/AsyncHandler.js";
// import ApiError from "../utils/ApiError.js";
// import ApiResponse from "../utils/ApiResponse.js";
// import dotenv from "dotenv";

// dotenv.config();

// // Configure Nodemailer for email complaints
// const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//     },
// });

// // Function to handle cybercrime-related requests
// const handleCyberRequest = AsyncHandler(async (req, res) => {
//     console.log("Full Request Body:", req.body);
//     const { response, data } = req.body; // Extract response and data separately
//     console.log("Received Response:", response);
//     console.log("Received Data:", data);

//     if (response === undefined || data === undefined) {
//         throw new ApiError(400, "Missing required parameters");
//     }

//     if (response === 0) {
//         // Directly pass request body data
//         return res.status(200).json(new ApiResponse(200, data, "Data received successfully"));
//     }

//     if (response === 1) {
//         const { name, phone, address, complaint, time, date } = data;
//         if (!name || !phone || !address || !complaint || !time || !date) {
//             throw new ApiError(400, "Missing required fields for complaint.");
//         }

//         const mailOptions = {
//             from: process.env.EMAIL_USER,
//             to: "ayushbiju8@gmail.com", // Replace with actual recipient
//             subject: "New Cyber Crime Complaint",
//             text: `Complaint Details:\n\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nComplaint: ${complaint}\nDate: ${date}\nTime: ${time}`,
//         };

//         try {
//             let info = await transporter.sendMail(mailOptions);
//             return res.status(200).json(new ApiResponse(200, { message: "Complaint filed successfully via email!", info, data }));
//         } catch (error) {
//             throw new ApiError(500, "Failed to send complaint email.", error);
//         }
//     }

//     throw new ApiError(400, "Invalid response type.");
// });


// const recieveTextFromFrontend = AsyncHandler(async (req, res) => {
//     const { text } = req.body;
//     console.log(text);

//     const session_id="550e8400-e29b-41d4-a716-446655440000"
//     if (!text || !session_id) {
//         throw new ApiError(400, "Text and session_id are required");
//     }

//     try {
//         // Format the request data
//         const requestData = { text, session_id };

//         // Make a POST request to the external API
//         const response = await axios.post("http://192.168.79.89:7000/analyze-text/", requestData);

//         // Return the response in your standard format
//         console.log(response.data.data);
//         return res.status(200).json(
//             new ApiResponse(200, {
//                 response_type: response.data.response_type,
//                 message: response.data.data
//             }, "Text analyzed successfully")
//         );

//     } catch (error) {
//         console.error("Error in analyze-text API:", error.message);
//         throw new ApiError(500, "Failed to analyze text");
//     }
// }); 


// export { handleCyberRequest ,recieveTextFromFrontend};












// import nodemailer from "nodemailer";
// import axios from "axios";
// import AsyncHandler from "../utils/AsyncHandler.js";
// import ApiError from "../utils/ApiError.js";
// import ApiResponse from "../utils/ApiResponse.js";


// const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS,
//     },
// });


// const handleCyberRequest = AsyncHandler(async (req, res) => {
//     console.log("🔥 Full Request Body:", req.body);
//     const { response, data } = req.body; // Extract response and data separately
//     console.log("✅ Received Response:", response);
//     console.log("✅ Received Data:", data);

//     if (response === undefined || data === undefined) {
//         throw new ApiError(400, "Missing required parameters");
//     }

//     if (response === 0) {
//         return res.status(200).json(new ApiResponse(200, data, "Data received successfully"));
//     }

//     if (response === 1) {
//         const { name, phone, address, complaint, time, date } = data;
//         if (!name || !phone || !address || !complaint || !time || !date) {
//             throw new ApiError(400, "Missing required fields for complaint.");
//         }

//         const mailOptions = {
//             from: process.env.EMAIL_USER,
//             to: "ayushbiju8@gmail.com", // Replace with actual recipient
//             subject: "New Cyber Crime Complaint",
//             text: `Complaint Details:\n\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nComplaint: ${complaint}\nDate: ${date}\nTime: ${time}`,
//         };

//         try {
//             let info = await transporter.sendMail(mailOptions);
//             return res.status(200).json(new ApiResponse(200, { message: "Complaint filed successfully via email!", info, data }));
//         } catch (error) {
//             throw new ApiError(500, "Failed to send complaint email.", error);
//         }
//     }

//     throw new ApiError(400, "Invalid response type.");
// });


// const recieveTextFromFrontend = AsyncHandler(async (req, res) => {
//     console.log("🔥 Full Request Body:", req.body);
//     const { text } = req.body;

//     if (!text) {
//         throw new ApiError(400, "Text is required");
//     }

//     const session_id = "550e8400-e29b-41d4-a716-446655440000"; // Static session_id

//     try {
//         // Format the request data
//         const requestData = { text, session_id };

//         // Make a POST request to the external API
//         const response = await axios.post("http://192.168.79.89:7000/analyze-text/", requestData);

//         // Extract response type and data from the API
//         const { response_type, data } = response.data;

//         console.log("✅ API Response Type:", response_type);
//         console.log("✅ API Data:", data);

//         if (response_type === 0) {
//             console.log(response.data.data);
//             return res.status(200).json(
//                 new ApiResponse(200, {
//                     response_type: response.data.response_type,
//                     message: response.data.data
//                 }, "Text analyzed successfully")
//             );
//         }

//         if (response_type === 1) {
//             const { name, phone, address, complaint, time, date } = data;

//             if (!name || !phone || !address || !complaint || !time || !date) {
//                 throw new ApiError(400, "Missing required fields for complaint.");
//             }

//             const mailOptions = {
//                 from: process.env.EMAIL_USER,
//                 to: "ayushbiju8@gmail.com", // Replace with actual recipient
//                 subject: "New Cyber Crime Complaint",
//                 text: `Complaint Details:\n\nName: ${name}\nPhone: ${phone}\nAddress: ${address}\nComplaint: ${complaint}\nDate: ${date}\nTime: ${time}`,
//             };

//             try {
//                 let info = await transporter.sendMail(mailOptions);
//                 return res.status(200).json(new ApiResponse(200, { message: "Complaint filed successfully via email!", info, data }));
//             } catch (error) {
//                 throw new ApiError(500, "Failed to send complaint email.", error);
//             }
//         }

//         throw new ApiError(400, "Invalid response type from AI API.");

//     } catch (error) {
//         console.error("❌ Error in analyze-text API:", error.message);
//         throw new ApiError(500, "Failed to analyze text");
//     }
// });

// export { handleCyberRequest, recieveTextFromFrontend };
