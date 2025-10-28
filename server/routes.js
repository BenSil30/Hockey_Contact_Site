import { createOAuth2Client, SCOPES } from "./gmailClient.js";
import { google } from "googleapis";
import fs from "fs/promises"
import path from "path";
import { fileURLToPath } from "url";
import { arrayBuffer } from "stream/consumers";

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

	function base64UrlEncode(str) {
		return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	async function loadTemplatesMaybe() {
		try {
			const filePath = path.join(__dirname, "data_files", "VGK_Templates.json");
			const raw = await fs.readFile(filePath, "utf8");
			const data = JSON.parse(raw);

			return data;
		} catch (err) {
			console.warn("Could not load templates", err && err.message);
		}
		return [];
	}

	function buildRawMessage({ fromEmail, toEmail, subject, body }) {
		const lines = [
			`From: ${fromEmail}`,
			`To: ${toEmail}`,
			`Subject: ${subject}`,
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset="UTF-8',
			"",
			body
		];

		console.log(lines);
		return base64UrlEncode(lines.join("\r\n"));
	}

	async function runInBatches(items, batchSize, taskFn) {
		const res = [];
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			const settled = await Promise.allSettled(batch.map(item => taskFn(item)));
			res.push(...settled);
		}
		return res;
	}

	app.post("/api/send_messages", async (req, res) => {
		// debugger logs why the fuck is this not working
		const slog = (...args) => console.log(new Date().toISOString(), "[send_messages]", ...args);

		try {
			slog("Received send batch request");

			if (!req.session || !req.session.tokens) {
				slog("No session tokens — rejecting");
				return res.status(401).json({ error: "not_authenticated" });
			}

			const body = req.body || {};
			slog("Raw body:", JSON.stringify(body).slice(0, 2000)); // truncate very long logs

			// 2) normalize assignments
			let assignmentsObj = {};
			if (Array.isArray(body.assignments)) {
				for (const entry of body.assignments) {
					if (!entry || !entry.email) continue;
					assignmentsObj[String(entry.email)] = Array.isArray(entry.templateIds) ? entry.templateIds : [];
				}
			} else if (body.assignments && typeof body.assignments === "object") {
				assignmentsObj = Object.fromEntries(
					Object.entries(body.assignments).map(([k, v]) => [String(k), Array.isArray(v) ? v : []])
				);
			} else {
				slog("Invalid payload shape");
				return res.status(400).json({ error: "invalid_payload", message: "assignments missing or wrong shape" });
			}

			slog("Normalized assignments:", JSON.stringify(assignmentsObj));

			const recipientEmails = Object.keys(assignmentsObj);
			// slog("Recipient emails count:", recipientEmails.length, recipientEmails.slice(0, 10));

			if (!recipientEmails.length) {
				slog("No recipient emails found in assignments");
				return res.status(400).json({ error: "No recipient emails" });
			}

			const availableTemplates = await loadTemplatesMaybe();
			// slog("Loaded templates count:", Array.isArray(availableTemplates) ? availableTemplates.length : 0);
			slog(availableTemplates);

			const templatesArray = Array.isArray(availableTemplates)
				? availableTemplates
				: Object.values(availableTemplates);
			const byId = Object.fromEntries(templatesArray[0].map(t => [String(t.id), t]));
			slog("Template IDs available:", Object.keys(byId));
			// slog(templatesArray);

			// gmail
			const oauthClient = createOAuth2Client();
			oauthClient.setCredentials(req.session.tokens);
			const gmail = google.gmail({ version: "v1", auth: oauthClient });

			let senderEmail = req.session.userEmail || null;
			if (!senderEmail) {
				try {
					const profile = await gmail.users.getProfile({ userId: "me" });
					// FIXED: assignment (was `-` previously)
					senderEmail = profile.data.emailAddress;
					req.session.userEmail = senderEmail;
					slog("Determined sender email from profile:", senderEmail);
				} catch (err) {
					slog("Could not fetch profile email:", err && err.message);
				}
			} else {
				slog("Using senderEmail from session:", senderEmail);
			}

			if (!senderEmail) {
				slog("No sender email available — aborting");
				return res.status(500).json({ error: "Could not determine sender email" });
			}

			// 6) send tasks for ALL recipients (even if only "1" is selected)
			const tasks = []; // each: { to, templateId, missingTemplate?, subject, body }
			for (const [email, tplIds] of Object.entries(assignmentsObj)) {
				slog("Preparing assignments for:", email, "templateIds:", tplIds);
				if (!Array.isArray(tplIds) || tplIds.length === 0) {
					slog(" -> no templates assigned to this recipient, skipping:", email);
					continue;
				}
				for (const tid of tplIds) {
					const template = byId[String(tid)];
					if (!template) {
						slog(" -> template id missing for tid=", tid, "for recipient", email);
						tasks.push({ to: email, templateId: tid, missingTemplate: true });
					} else {
						const subject = template.subject || template.name || `Message - ${template.id}`;
						const templateBody = template.body || template.text || "";
						slog(" -> will send template:", tid, "name:", template.name, "to:", email);
						tasks.push({ to: email, templateId: String(tid), subject, body: templateBody });
					}
				}
			}

			slog("Total send tasks prepared:", tasks.length);
			// report missing templates
			const missing = tasks.filter(t => t.missingTemplate).map(t => ({ to: t.to, templateId: t.templateId }));
			if (missing.length) {
				slog("Missing templates for tasks:", missing);
			}

			if (!tasks.length) {
				slog("No valid send tasks found after building tasks");
				return res.status(400).json({ error: "no_send_tasks", message: "No valid template assignments found" });
			}

			const LIMIT = 3;
			const allResults = [];

			async function doSendTask(task) {
				if (task.missingTemplate) {
					const result = { status: "failed", reason: "missing_template", email: task.to, templateId: task.templateId };
					slog("Skipping send (missing template):", result);
					return result;
				}

				slog("Attempting send -> to:", task.to, "templateId:", task.templateId, "subject:", task.subject?.slice(0, 120));
				try {
					const raw = buildRawMessage({
						fromEmail: senderEmail,
						toEmail: task.to,
						subject: task.subject,
						body: task.body
					});

					const sendRes = await gmail.users.messages.send({
						userId: "me",
						requestBody: { raw }
					});

					const result = { status: "sent", email: task.to, templateId: task.templateId, messageId: sendRes.data?.id };
					slog("Send success:", result);
					return result;
				} catch (err) {
					slog("Send error for", task.to, "templateId", task.templateId, err && err.message);
					return { status: "failed", reason: err?.message || "send_failed", email: task.to, templateId: task.templateId };
				}
			}

			// batches 
			for (let i = 0; i < tasks.length; i += LIMIT) {
				const batch = tasks.slice(i, i + LIMIT);
				const settled = await Promise.all(batch.map(t => doSendTask(t)));
				allResults.push(...settled);
				// small pause optional (throttle below)
				// await new Promise(r => setTimeout(r, 250));
			}

			// 8) you'd think i'd have logged enough by now
			const summary = {
				totalTasks: tasks.length,
				success: allResults.filter(r => r.status === "sent").length,
				failed: allResults.filter(r => r.status !== "sent").length,
				details: allResults
			};

			slog("Send summary:", JSON.stringify(summary, null, 2));

			return res.json(summary);

		} catch (err) {
			console.error(new Date().toISOString(), "[send_messages] UNCAUGHT ERROR:", err && (err.stack || err));
			if (!res.headersSent) {
				return res.status(500).json({ error: "server_error", message: err?.message || String(err) });
			}
		}
	});

};
