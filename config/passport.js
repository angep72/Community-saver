const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {

        // Check if user exists by googleId
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {          // Check if email already exists (user registered normally)
          user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            await user.save();
          } else {
            // Create new user
            const Branch = require("../models/Branch");
            const defaultBranch = await Branch.findOne();

            if (!defaultBranch) {
              console.error("❌ No branch found!");
              return done(null, false, {
                message: "User cannot sign in: No branch found. Please contact admin to create your account."
              });
            }

            user = await User.create({
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              email: profile.emails[0].value,
              googleId: profile.id,
              isActive: true,
              status: "approved", // Auto-approve OAuth users
              role: "member",
              branch: defaultBranch._id,
              password: Math.random().toString(36).slice(-8),
            });
            
            console.log(" ");
          }
        }

        // Check if user is active
        if (!user.isActive) {
          console.error("❌ User account is deactivated");
          return done(null, false, {
            message: "Your account has been deactivated."
          });
        }
        return done(null, user);
      } catch (err) {
        console.error("❌ Google OAuth error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;