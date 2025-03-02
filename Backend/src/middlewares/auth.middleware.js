import AsyncHandler from "../utils/AsyncHandler.js"
import jwt from "jsonwebtoken"
import ApiError from "../utils/ApiError.js"
import { User } from "../models/user.models.js"

const verifyJWT = AsyncHandler(async (req,res,next) => {
    try {
        const token =  await req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
        if(!token){
            throw new ApiError(401,"Unauthorized Request(Not logged in or No Token)")
        }
        const decodedToken = jwt.verify(token,process.env.ACCESS_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id).select(
            "-password -refreshToken"
        )
        if(!user){
            throw new ApiError(401,"Invalid Access Token")
        }

        req.user = user;
        next()
    } catch (error) {
        throw new ApiError(400,`Error Occured While verifying JWT: ${error}`)
    }
})

export {verifyJWT}