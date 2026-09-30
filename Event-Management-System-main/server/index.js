const express = require("express");
const app = express();
const mongoose = require("mongoose");

const cors = require("cors");

const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const userRouter = require("./routes/authRoutes");
const dashboardRouter = require("./routes/userDashboardRoutes");
const paymentRouter = require("./routes/paymentRoute");
const adminRouter = require("./routes/adminRoutes");
const eventRouter = require("./routes/eventRoutes");
// const checkInRouter = require("./routes/checkInRoutes")

dotenv.config();

// database url
const mongoUri = process.env.MONGO_URI || process.env.MONGO_ATLAS_URI;
if (!mongoUri) {
    console.error("❌ ERROR: MONGO_URI or MONGO_ATLAS_URI not found in environment variables!");
    process.exit(1);
}

mongoose
    .connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log("✅ MongoDB connected successfully!");
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err.message);
        process.exit(1);
    });

require("./models/otpAuth");
require("./models/user");
require("./models/admin");
require("./models/event");

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cookieParser());
app.use(cors());

app.use("/", paymentRouter);
app.use("/user", userRouter);
app.use("/user", dashboardRouter);

app.use("/", adminRouter);
app.use("/", eventRouter);

app.get("/", (req, res) => {
    res.send("Event Management micro services API.");
});

app.listen(process.env.PORT || 5000, () => {
    console.log(`Server Running on🚀: ${process.env.PORT}`);
});
