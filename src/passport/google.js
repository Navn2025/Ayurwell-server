import passport from "passport";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";
import prisma from "../db/db.js";
import {publishToQueue} from "../broker/borker.js";

const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
}=process.env;

const callbackURL=
    GOOGLE_CALLBACK_URL||"http://localhost:3000/api/auth/google/callback";

if (!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET)
{
    console.warn(
        "Google OAuth env vars missing: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
    );
}

if (!GOOGLE_CALLBACK_URL)
{
    console.warn(
        `GOOGLE_CALLBACK_URL not set. Using default ${callbackURL}. Ensure this URL is added to Google OAuth redirect URIs.`
    );
}

// Only initialize Google OAuth if credentials are provided
if (GOOGLE_CLIENT_ID&&GOOGLE_CLIENT_SECRET)
{
    passport.use(
        new GoogleStrategy(
            {
                clientID: GOOGLE_CLIENT_ID,
                clientSecret: GOOGLE_CLIENT_SECRET,
                callbackURL,
            },
            async (_accessToken, _refreshToken, profile, done) =>
            {
                try
                {
                    const email=profile?.emails?.[0]?.value;
                    if (!email)
                    {
                        return done(new Error("Google account email is required"));
                    }

                    const firstName=profile?.name?.givenName||"Google";
                    const lastName=profile?.name?.familyName||"User";
                    const googleId=profile.id;

                    const user=await prisma.$transaction(async (tx) =>
                    {
                        let user=await tx.user.findUnique({
                            where: {email},
                        });

                        // 🔹 User already exists
                        if (user)
                        {
                            // Link Google account if not linked
                            if (!user.googleId)
                            {
                                user=await tx.user.update({
                                    where: {email},
                                    data: {
                                        googleId,
                                        isEmailVerified: true,
                                    },
                                });
                            }

                            return user;
                        }

                        // 🔹 New user via Google
                        user=await tx.user.create({
                            data: {
                                email,
                                googleId,
                                firstName,
                                lastName,
                                isEmailVerified: true,
                                isProfileComplete: false,
                            },
                        });

                        // 🔹 Create cart for new user
                        await tx.cart.create({
                            data: {
                                userId: user.id,
                            },
                        });
                        await publishToQueue("AUTH_NOTIFICATION.USER_CREATED", {
                            userId: user.id,
                            email: user.email,
                            firstName: user.firstName,
                            lastName: user.lastName,
                        });

                        return user;
                    });

                    return done(null, user);
                } catch (error)
                {
                    return done(error);
                }
            }
        )
    );
}

export default passport;
