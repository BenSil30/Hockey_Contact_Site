import { createOAuth2Client, SCOPES } from "./gmailClient.js";
import { google } from "googleapis";
import fs from "fs/promises"
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default (app) => {
	// Landing page
	app.get("/", (req, res) => {
		res.sendFile(path.join(__dirname, "index.html"));
	});

	// Start OAuth with Google
	app.get("/auth/google", (req, res) => {
		const oauth2Client = createOAuth2Client();
		const url = oauth2Client.generateAuthUrl({
			access_type: "offline", // we want refresh token
			scope: SCOPES,
			prompt: "consent" // ensure refresh token on first auth
		});
		res.redirect(url);
	});

	// OAuth callback
	app.get("/auth/google/callback", async (req, res) => {
		const oauth2Client = createOAuth2Client();
		const code = req.query.code;
		if (!code) return res.status(400).send("No code in callback");
		try {
			const { tokens } = await oauth2Client.getToken(code);
			// Save tokens in session (dev). tokens contain access_token, refresh_token
			req.session.tokens = tokens;
			// Optionally: store the user's email by calling gmail.profile
			oauth2Client.setCredentials(tokens);
			const gmail = google.gmail({ version: "v1", auth: oauth2Client });
			const profile = await gmail.users.getProfile({ userId: "me" });
			req.session.userEmail = profile.data.emailAddress;
			res.redirect("/ui"); // single page app
		} catch (err) {
			console.error("OAuth callback error:", err);
			res.status(500).send("Authentication failed");
		}
	});

	// Logout
	app.get("/auth/logout", (req, res) => {
		req.session.destroy(() => {
			res.redirect("/");
		});
	});

	// Serve UI page (minimal SPA)
	app.get("/ui", (req, res) => {
		if (!req.session.tokens) {
			return res.redirect("/auth/google");
		}
		res.sendFile(path.join(__dirname, "ui.html"));
	});

	// API: list recent emails
	// app.get("/api/emails", async (req, res) => {
	// 	if (!req.session.tokens) return res.status(401).send({ error: "not_auth" });

	// 	const oauth2Client = createOAuth2Client();
	// 	oauth2Client.setCredentials(req.session.tokens);
	// 	const gmail = google.gmail({ version: "v1", auth: oauth2Client });

	// 	try {
	// 		// list message IDs
	// 		const listRes = await gmail.users.messages.list({ userId: "me", maxResults: 10 });
	// 		const messages = listRes.data.messages || [];

	// 		// fetch metadata for each message (subject, from, snippet)
	// 		const results = [];
	// 		for (const m of messages) {
	// 			const msg = await gmail.users.messages.get({
	// 				userId: "me",
	// 				id: m.id,
	// 				format: "metadata",
	// 				metadataHeaders: ["Subject", "From", "Date"]
	// 			});
	// 			const headers = msg.data.payload?.headers || [];
	// 			const findHeader = (name) => (headers.find(h => h.name === name) || {}).value || "";
	// 			results.push({
	// 				id: msg.data.id,
	// 				threadId: msg.data.threadId,
	// 				subject: findHeader("Subject"),
	// 				from: findHeader("From"),
	// 				date: findHeader("Date"),
	// 				snippet: msg.data.snippet || ""
	// 			});
	// 		}
	// 		res.json(results);
	// 	} catch (err) {
	// 		console.error("Error listing emails:", err);
	// 		res.status(500).json({ error: "failed_to_list" });
	// 	}
	// });

	app.get("/api/emails", async (req, res) => {
		try {
			const filePath = path.join(__dirname, "data_files", "VGK_Contacts.json");
			const data = await fs.readFile(filePath, "utf8");
			const emails = JSON.parse(data);
			res.json(emails);
		} catch (err) {
			console.error("Failed to read emails.json:", err);
			res.status(500).json({ error: "failed_to_load_emails" });
		}
	});

	app.get("/api/email_templates", async (req, res) => {
		try {
			const filePath = path.join(__dirname, "data_files", "VGK_Templates.json");
			const data = await fs.readFile(filePath, "utf8");
			const templates = JSON.parse(data);
			res.json(templates);
		} catch (err) {
			console.error("Failed to read email_templates:", err);
			res.status(500).json({ error: "failed_to_load_emails" });
		}
	})

	app.post("api/send_messages", async (req, res) => {
		if (!req.session.tokens) return res.status(401).send({ error: "Not authorized"});
	)};
};
