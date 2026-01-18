import cron from "node-cron";
import {retryAwbAssignment} from '../worker/shiprocket.awp.retry.worker.js';

let isRunning=false;

// Run every 10 minutes
cron.schedule(
    "*/10 * * * *",
    async () =>
    {
        if (isRunning)
        {
            console.log("⏸️ AWB retry already running, skipping");
            return;
        }

        isRunning=true;
        console.log("⏰ Cron triggered: AWB retry");

        try
        {
            await retryAwbAssignment();
        } catch (err)
        {
            console.error("❌ Cron AWB retry failed:", err.message);
        } finally
        {
            isRunning=false;
        }
    },
    {
        timezone: "Asia/Kolkata",
    }
);
