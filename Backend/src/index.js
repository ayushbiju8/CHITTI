import dotenv from "dotenv"
import connectDB from "./db/index.js";
import app from "./app.js";

dotenv.config({path:'./.env'})

connectDB()
.then((e)=>{
    app.listen(process.env.PORT,()=>{
        console.log(`App Listening on PORT : ${process.env.PORT}`);
    })
})
.catch((e) => {
  console.log("Mongo Connection Failed")
})

