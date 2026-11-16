// Deploys firestore.rules to the PROJECT below using the service account key,
// via the Firebase Rules REST API. This bypasses the firebase-CLI path (which
// needs a serviceusage permission the SDK service account lacks).
import { GoogleAuth } from "google-auth-library";
import fs from "fs";

const PROJECT = "datadash-b6c5f";
const RULES_FILE = "./firestore.rules";

const auth = new GoogleAuth({
  keyFile: "./serviceAccountKey.json",
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function api(url, method, body) {
  const client = await auth.getClient();
  const res = await client.request({ url, method, data: body });
  return res.data;
}

async function deployRules() {
  const source = fs.readFileSync(RULES_FILE, "utf8");
  console.log(`📄 Read ${RULES_FILE} (${source.length} bytes)`);

  console.log("\n📤 Creating ruleset...");
  const ruleset = await api(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    "POST",
    { source: { files: [{ name: "firestore.rules", content: source }] } }
  );
  console.log("✅ Ruleset created:", ruleset.name);

  console.log("\n🚀 Releasing to cloud.firestore...");
  await api(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    "PATCH",
    { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: ruleset.name } }
  );
  console.log("✅ Rules are LIVE on", PROJECT);
}

deployRules().catch((e) => {
  console.error("❌ Failed:", e?.response?.data?.error?.message || e.message);
  process.exit(1);
});
