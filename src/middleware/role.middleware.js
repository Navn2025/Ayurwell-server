async function assertAdmin(req, res, next)
{
    if (!req.user)
    {
        return res.status(401).json({message: "Unauthorized: Please login"});
    }
    
    if (req.user.role!=="admin"&&req.user.role!=="ADMIN")
    {
        return res.status(403).json({message: "Forbidden: Admin access required"});
    }
    next();
}
export default assertAdmin;