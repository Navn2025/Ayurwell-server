import axios from "../../config/axios.config.js";

export async function getCourierOptions({
    pickupPincode,
    deliveryPincode,
    weight,
    cod=false,
    token
})
{
    try
    {
        const response=await axios.get("/courier/serviceability", {
            params: {
                pickup_postcode: pickupPincode,
                delivery_postcode: deliveryPincode,
                weight,
                cod: cod? 1:0
            },
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const couriers=response.data?.data?.available_courier_companies;

        if (!couriers||couriers.length===0)
        {
            throw new Error("No courier available for this location");
        }

        return couriers;

    } catch (error)
    {
        console.error(
            "❌ Shiprocket serviceability error:",
            error?.response?.data||error.message
        );
        throw error;
    }
}
