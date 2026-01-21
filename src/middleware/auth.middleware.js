import jwt from "jsonwebtoken";
async function authMiddleware(req, res, next)
{
    const authHeader=req.headers.authorization;
    const token=
        req.cookies?.token||
        (authHeader&&authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            :null);
    console.log(token);
    if (!token)
    {
        return res.status(401).json({
            message: "Unauthorized: No token provided"
        });
    }
    try
    {
        const decoded=jwt.verify(token, process.env.JWT_SECRET);
        console.log(decoded);
        req.user={userId: decoded.userId, email: decoded.email, role: decoded.role};
        next();
    }
    catch (error)
    {
        return res.status(401).json({message: "Unauthorized: Invalid token"});
    }
}

// Optional auth middleware - doesn't require token but attaches user if present
export async function optionalAuthMiddleware(req, res, next)
{
    const authHeader=req.headers.authorization;
    const token=
        req.cookies?.token||
        (authHeader&&authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            :null);

    if (!token)
    {
        req.user=null;
        return next();
    }

    try
    {
        const decoded=jwt.verify(token, process.env.JWT_SECRET);
        req.user={userId: decoded.userId, email: decoded.email, role: decoded.role};
    }
    catch (error)
    {
        req.user=null;
    }
    next();
}

export default authMiddleware;