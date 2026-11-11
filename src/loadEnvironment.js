import dotenv from "dotenv";

const { error } = dotenv.config({ quiet: true });
if (error && error.code !== "ENOENT") throw error;
