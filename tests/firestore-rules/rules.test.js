// Deny-all check for firestore.rules. Browsers get nothing; the gateway uses the Admin SDK, which bypasses rules.
// Run: npm install && npm test (needs Java; "demo-" project IDs never touch a real project).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bookshop",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "carts/alice"), { items: [] });
    await setDoc(doc(ctx.firestore(), "books/OL1W"), { title: "A" });
  });
});
after(async () => env?.cleanup());

for (const path of ["carts/alice", "profiles/alice", "books/OL1W", "meta/catalog", "quota/alice"]) {
  test(`${path}: no read or write, signed in or not`, async () => {
    for (const db of [env.unauthenticatedContext().firestore(), env.authenticatedContext("alice").firestore()]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { x: 1 }));
    }
  });
}
