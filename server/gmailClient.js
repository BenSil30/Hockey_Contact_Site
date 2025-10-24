import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const SCOPES = [
	"https://www.googleapis.com/auth/gmail.send"
];

export function createOAuth2Client() {
	return new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID,
		process.env.GOOGLE_CLIENT_SECRET,
		`${process.env.BASE_URL}/auth/google/callback`
	);
}

export { SCOPES };