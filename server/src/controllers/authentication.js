import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserByEmail,
  getUserBySessionToken,
} from "../actions/users.js";
import { authentication, random } from "../utils/index.js";

dotenv.config();

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name)
      return res
        .status(400)
        .json({ message: "Please fill all the required fields!" });

    const existingUser = await getUserByEmail(email);

    if (existingUser)
      return res.status(409).json({ message: "Email already in use!" });

    const salt = random();
    const user = await createUser({
      email,
      name,
      authentication: {
        salt,
        password: authentication(salt, password),
      },
    });

    return res
      .status(201)
      .json({ message: "User registered successfully!" })
      .end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong!" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Please fill all the required fields!" });

    const user = await getUserByEmail(email).select(
      "+authentication.salt +authentication.password"
    );

    if (!user) return res.status(404).json({ message: "User not found!" });

    const expectedHash = authentication(user.authentication.salt, password);

    if (user.authentication.password !== expectedHash)
      return res.status(403).json({ message: "Password mismatch!" });

    const token = jwt.sign({ userId: user._id }, process.env.AUTH_SECRET, {
      expiresIn: "24h",
    });

    user.authentication.sessionToken = token;
    await user.save();

    res.cookie("stream_auth", token, {
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({
      message: "Successfully logged in.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Something went wrong!" });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.cookies.stream_auth;

    if (!token)
      return res.status(401).json({ message: "No active session found." });

    const user = await getUserBySessionToken(token);

    if (user) {
      user.authentication.sessionToken = null;
      await user.save();
    }
    res.clearCookie("stream_auth");

    return res.status(200).json({ message: "Successfully logged out." });
  } catch (error) {
    console.error("Logout error:", error);
    return res
      .status(500)
      .json({ message: "An error occurred during logout." });
  }
};
