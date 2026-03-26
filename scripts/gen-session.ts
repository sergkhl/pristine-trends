import "dotenv/config";

/**
 * One-time: run locally with TELEGRAM_API_ID and TELEGRAM_API_HASH set.
 *   npm run gen-session
 * Copy the printed SESSION string into GitHub secret TELEGRAM_SESSION.
 * Never commit the session string.
 */
import { TelegramClient, sessions } from "telegram";
import input from "input";

const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the environment.");
  process.exit(1);
}

const client = new TelegramClient(new sessions.StringSession(""), API_ID, API_HASH, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => await input.text("Phone (+1234567897): "),
  password: async () => await input.text("2FA (empty if none): "),
  phoneCode: async () => await input.text("OTP: "),
  onError: (err) => console.error(err),
});

console.log("\nSESSION (paste into GitHub secret TELEGRAM_SESSION):\n");
console.log(client.session.save());

await client.disconnect();
