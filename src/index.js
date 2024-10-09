import "dotenv/config";
import connectDB from "./db/index.js";
import app from "./app.js";

connectDB()
  .then(
    app.listen(process.env.PORT || 5000, () => {
      console.log(`SERVER RUNNING AT PORT ${process.env.PORT}`);
    })
  )
  .catch((err) => {
    console.log(`MONGODB CONNECTION FAILED!!${err}`);
  });
