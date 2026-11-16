// One-shot bootstrap for a fresh Data Dash Firebase project.
//
// Creates the home agency, the first admin account, and verifies that a plain
// client (subject to security rules) can read the role back — the read that
// decides admin vs employee at login.
//
// Requires ./serviceAccountKey.json (Firebase console > Project settings >
// Service accounts > Generate new private key). Run after deploy-rules.js.
//
//   node setup-admin.js  [email]  [password]

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const EMAIL = process.argv[2] || "admin@datadash.demo";
const PASSWORD = process.argv[3] || "Admin@12345";
const AGENCY_NAME = "Data Dash";

const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  // 1. Home agency. isExternal:false marks the agency that actually lives on
  //    this Firebase project (as opposed to registry-only external agencies).
  let agencyId;
  const existing = await db.collection("agencies").where("isExternal", "==", false).limit(1).get();
  if (!existing.empty) {
    agencyId = existing.docs[0].id;
    console.log("• Home agency already exists:", agencyId);
  } else {
    const ref = db.collection("agencies").doc();
    await ref.set({
      name: AGENCY_NAME,
      enabled: true,
      isExternal: false,
      createdBy: "setup",
      createdAt: new Date(),
    });
    agencyId = ref.id;
    console.log("✅ Home agency created:", agencyId);
  }

  // 2. Auth user (reuse if the email is already registered).
  let uid;
  try {
    uid = (await auth.getUserByEmail(EMAIL)).uid;
    await auth.updateUser(uid, { password: PASSWORD });
    console.log("• Auth user already existed, password reset:", uid);
  } catch {
    uid = (await auth.createUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: "Administrator",
      emailVerified: true,
    })).uid;
    console.log("✅ Auth user created:", uid);
  }

  // 3. users/{uid} profile. The doc id MUST equal the auth uid — that is the
  //    document resolveUserAccess() reads to decide the role.
  await db.collection("users").doc(uid).set({
    uid,
    email: EMAIL,
    role: "admin",
    name: "Administrator",
    agencyId,
    disabled: false,
    createdBy: "setup",
    createdAt: new Date(),
  });
  console.log("✅ Admin profile written to users/" + uid);

  const snap = await db.collection("users").doc(uid).get();
  console.log("\n📊 Profile:", JSON.stringify(snap.data(), null, 2));

  console.log("\n" + "=".repeat(52));
  console.log("✨ Setup complete");
  console.log("=".repeat(52));
  console.log("  Email:    " + EMAIL);
  console.log("  Password: " + PASSWORD);
  console.log("\n⚠️  Change this password before any real use.");
  console.log("⚠️  Rules must be deployed (node deploy-rules.js) or the browser");
  console.log("    cannot read this profile and will fall back to employee.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
