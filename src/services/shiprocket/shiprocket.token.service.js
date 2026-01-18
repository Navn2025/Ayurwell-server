import axios from "../../config/axios.config.js";
import redis from "../ioredis.service.js";

const TOKEN_KEY="shiprocket:token";
const TOKEN_TTL=23*60*60;

export const generateToken=async () =>
{
    const cachedToken=await redis.get(TOKEN_KEY);
    if (cachedToken) return cachedToken;

    const response=await axios.post("/auth/login", {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD,
    });

    if (!response.data?.token)
    {
        throw new Error("Failed to generate Shiprocket token");
    }

    const token=response.data.token;
    await redis.set(TOKEN_KEY, token, "EX", TOKEN_TTL);

    return token;
};


export async function loadPickupLocation()
{
    const res=await axios.get("/settings/company/pickup", {
        headers: {Authorization: `Bearer ${await generateToken()}`},
    });


}

