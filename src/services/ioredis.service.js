import dotenv from 'dotenv';
dotenv.config();
import {Redis} from 'ioredis';
const redis=new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
})
redis.on("connect", () =>
{
    console.log("connected to redis");
})
export default redis;
