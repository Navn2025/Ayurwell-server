

import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import passport from "passport";
import {connect} from "./broker/borker.js";

import authRoutes from "./routes/auth.routes.js";
import productImageRoutes from "./routes/product.image.route.js";
import categoryRoutes from "./routes/category.route.js";
import productRoutes from "./routes/products.route.js";
import addressRoutes from "./routes/address.route.js";
import searchRoutes from "./routes/search.route.js";
import cartRoutes from "./routes/cart.route.js";
import razorpayRoutes from "./routes/razorpay.payment.route.js";
import paymentRoutes from "./routes/payment.route.js";
import orderRoutes from "./routes/order.route.js";
import adminRoutes from "./routes/admin.route.js";
import webhooksRotes from './routes/webhook.route.js';
import refundRoutes from "./routes/refund.route.js";
import concernRoutes from "./routes/concern.route.js";
import shipmentRoutes from "./routes/shipment.route.js";
import codRoutes from "./routes/cod.route.js";
import reviewRoutes from "./routes/review.route.js";
import returnRoutes from "./routes/return.route.js";
import contactRoutes from "./routes/contact.routes.js";
import "./passport/google.js";
import listners from "./broker/listners.js";
import {generateToken} from './services/shiprocket/shiprocket.token.service.js';
import morgan from "morgan";
import cors from "cors";

import "./cron/cron.job.js";

connect().then(() =>
{
    console.log("Connected to RabbitMQ");
    listners();
}).catch((error) =>
{
    console.error("Failed to connect to RabbitMQ:", error);
});
generateToken();

const app=express();
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}))
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.set("trust proxy", 1);


app.get("/", (req, res) =>
{
    res.send("Welcome to the Ayurwell API");
});

app.use("/api/auth", authRoutes);
app.use("/api/product/image", productImageRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/product", productRoutes);
app.use("/api/address", addressRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/cod', codRoutes)
app.use('/api/razorpay', razorpayRoutes)
app.use("/api/payment", paymentRoutes);
app.use('/api/order', orderRoutes)
app.use("/api/admin", adminRoutes);
app.use("/api/webhook", webhooksRotes);
app.use("/api/refund", refundRoutes);
app.use("/api/concern", concernRoutes);
app.use("/api/shipment", shipmentRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/return', returnRoutes);
app.use('/api/contact', contactRoutes);
export default app;