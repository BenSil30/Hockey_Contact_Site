import express from "express";
import registerRoutes from "./routes.js";
import session from "express-session";
import dotenv from "dotenv";

dotenv.config();

export default (port) => {
	const app = express();

	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	// sessions - development setup. In production, use a DB-backed store.
	app.use(session({
		secret: process.env.SESSION_SECRET || "dev-secret",
		resave: false,
		saveUninitialized: false,
		cookie: { secure: false } // set secure:true when using HTTPS
	}));

	registerRoutes(app);

	app.listen(port, () => console.log(`App started on port ${port}`));
	return app;
};
