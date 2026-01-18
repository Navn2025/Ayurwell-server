import amqplib from "amqplib";
import dotenv from "dotenv";

dotenv.config();

let connection=null;
let channel=null;
let isConnecting=false;

const RABBIT_URL=process.env.RABBIT_URL;

/* ─────────────────────────────────────────────
   CONNECT WITH AUTO-RETRY
───────────────────────────────────────────── */
async function connect()
{
    if (connection&&channel) return;

    if (isConnecting) return;
    isConnecting=true;

    try
    {
        console.log("Connecting to RabbitMQ...");

        connection=await amqplib.connect(RABBIT_URL, {
            heartbeat: 30,
        });

        connection.on("error", (err) =>
        {
            console.error("RabbitMQ connection error:", err.message);
        });

        connection.on("close", () =>
        {
            console.warn("RabbitMQ connection closed. Reconnecting...");
            connection=null;
            channel=null;
            setTimeout(connect, 5000);
        });

        channel=await connection.createChannel();

        channel.on("error", (err) =>
        {
            console.error("RabbitMQ channel error:", err.message);
        });

        channel.on("close", () =>
        {
            console.warn("RabbitMQ channel closed.");
            channel=null;
        });

        console.log("RabbitMQ connected successfully");
    } catch (err)
    {
        console.error("RabbitMQ connection failed:", err.message);
        connection=null;
        channel=null;
        setTimeout(connect, 5000);
    } finally
    {
        isConnecting=false;
    }
}

/* ─────────────────────────────────────────────
   PUBLISH
───────────────────────────────────────────── */
async function publishToQueue(queueName, data={})
{
    if (!channel) await connect();
    if (!channel) return;

    await channel.assertQueue(queueName, {durable: true});

    channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(data)),
        {persistent: true}
    );
}


async function subscribeToQueue(queueName, callback)
{
    if (!channel) await connect();
    if (!channel) return;

    await channel.assertQueue(queueName, {durable: true});

    channel.consume(queueName, async (msg) =>
    {
        if (!msg) return;

        try
        {
            const data=JSON.parse(msg.content.toString());
            await callback(data);
            channel.ack(msg);
        } catch (err)
        {
            console.error("Queue message processing failed:", err);
            channel.nack(msg, false, false); // ❌ don't requeue bad messages
        }
    });
}

/* ─────────────────────────────────────────────
   GLOBAL SAFETY (Node v22)
───────────────────────────────────────────── */
process.on("uncaughtException", (err) =>
{
    console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) =>
{
    console.error("Unhandled Rejection:", reason);
});

export
{
    connect,
    publishToQueue,
    subscribeToQueue,
};

export default {
    connect,
    publishToQueue,
    subscribeToQueue,
};
