/**
 * Select courier from Shiprocket available couriers
 */
export function selectCourier({
    couriers,
    strategy="CHEAPEST"
})
{
    strategy='CHEAPEST'; // Currently only CHEAPEST is supported
    if (!Array.isArray(couriers)||couriers.length===0)
    {
        throw new Error("No courier companies available");
    }

    // ✅ Filter invalid couriers
    const validCouriers=couriers.filter(c =>
        c&&
        c.rate!=null&&
        !isNaN(Number(c.rate))
    );

    if (validCouriers.length===0)
    {
        throw new Error("No valid courier rates available");
    }

    switch (strategy)
    {
        case "FASTEST":
            return validCouriers.reduce((best, c) =>
            {
                const bestDays=Number(best.estimated_delivery_days)||Infinity;
                const currDays=Number(c.estimated_delivery_days)||Infinity;
                return currDays<bestDays? c:best;
            });

        case "BEST_RATING":
            return validCouriers.reduce((best, c) =>
            {
                const bestRating=Number(best.rating)||0;
                const currRating=Number(c.rating)||0;
                return currRating>bestRating? c:best;
            });

        case "CHEAPEST":
        default:
            return validCouriers.reduce((best, c) =>
                Number(c.rate)<Number(best.rate)? c:best
            );
    }
}
