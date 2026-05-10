# Firebase & Firestore setup (from zero to viewing documents)

This guide walks you through **creating a Firebase account**, **a project**, **Authentication (login)**, **Firestore**, **security rules**, and **how to open the console and inspect your documents**. It matches a **low-write** pattern: store the order list as **one JSON field** on **one document**, and **replace** that document (or field) when you sync—no history of old shares, so you avoid extra reads/writes.

---

## Part 1 — Google account and Firebase Console

1. Open **[https://console.firebase.google.com](https://console.firebase.google.com)** in a desktop browser (Chrome is fine).
2. Sign in with a **Google account** (your Gmail). If you do not have one, create a Google account first at [https://accounts.google.com/signup](https://accounts.google.com/signup).
3. You are now on the Firebase Console home. This is **not** the same as “Firestore login” in your app; here you manage the backend. App login is configured in **Part 4**.

---

## Part 2 — Create a Firebase project

1. Click **Add project** (or **Create a project**).
2. **Project name**: e.g. `Beiti` (any name you like).
3. **Google Analytics**: optional. For minimal setup you can **disable** Analytics to reduce noise; you can enable it later.
4. Click **Create project** and wait until it finishes, then **Continue**.

You should see the project **overview** (dashboard) for that project.

---

## Part 3 — Register your app (get config for later)

You need a registered app to obtain API keys and `appId` for the Expo/React Native Firebase SDK.

1. On the project overview, click the **Web** icon **`</>`** (“Add app” → Web), unless you are only using native Firebase plugins—in Expo, the **JavaScript SDK** (`firebase` npm package) is common; registering a **Web** app is still the right way to get `apiKey`, `projectId`, etc.
2. **App nickname**: e.g. `Beiti Web`.
3. You can skip **Firebase Hosting** for now.
4. Click **Register app**. Firebase shows a **firebaseConfig** object (JavaScript). **Copy it** and keep it private (treat `apiKey` as non-secret for client apps, but do not publish it in public repos without rules in place).

You will paste this into your app environment when you implement sync (not required to finish this console-only tutorial).

---

## Part 4 — Authentication (“login” for your app users)

Firestore does not “log in” by itself. Users authenticate with **Firebase Authentication**; then Firestore **security rules** decide if that user may read/write documents.

### 4.1 Enable Email/Password (simplest for two phones, one shared list)

**Pattern:** one **household** email/password, both phones sign in with the **same** user. Then every read/write is tied to one `uid`, which keeps rules simple and usage low.

1. In the left sidebar: **Build** → **Authentication**.
2. Click **Get started**.
3. Open the **Sign-in method** tab.
4. Click **Email/Password** → enable the **first** toggle (Email/Password) → **Save**.

### 4.2 Create the user you will use on both phones

1. Still under **Authentication**, open the **Users** tab.
2. Click **Add user**.
3. Enter an email and password (e.g. a dedicated email like `home-inventory@…` or any Gmail).
4. **Save**. Note the **User UID** column after creation—you may use it in rules or debugging.

Both you and your wife’s phones will use this **same** email/password in the app once you wire Firebase Auth in code.

**Alternative — Anonymous auth:** good for “no password,” but two devices get **two different UIDs**, so sharing one document needs either relaxed rules or a **known document ID** plus extra care. For clarity and security, **Email/Password with one shared user** is recommended for your “one JSON document” design.

---

## Part 5 — Create the Firestore database

1. Left sidebar: **Build** → **Firestore Database**.
2. Click **Create database**.
3. **Location**: choose a region **close to you** (cannot be changed later). For Jordan/Middle East, pick a nearby multi-region or regional option Firebase offers (e.g. `europe-west` or the closest listed).
4. **Security rules**:
   - For **first-time testing only**, you may start in **test mode** (expires after 30 days with a reminder). **Do not ship** an app with test rules.
   - Prefer: start with **locked** / production mode and paste **starter rules** from **Part 6** after you enable Auth.

---

## Part 6 — Security rules (one document per household, JSON payload)

Goal: **only signed-in users** can access data. With **one shared Firebase user** on both phones, you can scope data to that user’s UID so random people cannot read your list.

Example: one document per user at path `order_lists/{uid}` where `{uid}` is the authenticated user’s UID. Both phones use the **same** account → same document → same JSON.

In **Firestore Database** → **Rules** tab, you can use something like:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /order_lists/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

- **Reads:** loading the list (1 read per fetch if you read one document).
- **Writes:** updating that one document with the full JSON (1 write per sync).

Click **Publish** after editing rules.

**If you use a random “household id” as the document id** instead of `uid`, you must design rules carefully (otherwise anyone who guesses the id could access data). The **uid-based** path above is the safest simple approach.

---

## Part 7 — Data model (low usage: one JSON blob, replace on sync)

Suggested structure:

- **Collection:** `order_lists`
- **Document ID:** your Firebase Auth **User UID** (same on both phones if same login).
- **Fields** (example):
  - `payload` (type **map** or **string**): your `OrderListEntry[]` as JSON—Firestore **map/array** types work; storing as a **string** (`JSON.stringify`) is also fine and easy to reason about.
  - `updatedAt`: **timestamp** server or client, useful for “last writer wins.”

**Usage discipline:**

- On “share / sync”: **one** `set` (or `update`) on that single document with the full list—no per-item subcollections.
- Do **not** poll every second; subscribe with **onSnapshot** only where needed, or sync on screen focus + manual “Refresh” to minimize reads.

Deleting “the previous one” in Firestore terms: you do **not** need to delete old documents if you always **overwrite the same document**. If you instead created a **new** document per sync, you would **delete** the old doc in the same batch to avoid orphan reads/storage—your approach of **one fixed doc id** avoids that entirely.

---

## Part 8 — How to “check the list” of documents in the console

1. Go to **[https://console.firebase.google.com](https://console.firebase.google.com)** and select your project.
2. **Build** → **Firestore Database**.
3. Open the **Data** tab.
4. You will see **collections** at the root. Click **`order_lists`** (after your app or a manual “Start collection” test creates it).
5. Click a **document** to see **fields** (`payload`, `updatedAt`, etc.).

**Manual test (optional):** In **Data** → **Start collection** → collection ID `order_lists` → document ID paste your **User UID** from Authentication → add a field `payload` (string or map) → **Save**. You can confirm rules by trying read/write from the app next.

**Indexes:** For single-document get/set you usually **do not** need composite indexes. If Firestore shows an index error link in the console, open it and create the suggested index.

---

## Part 9 — Billing and the “Spark” vs “Blaze” plan

- **Spark (free)** includes Firestore within **[free quotas](https://firebase.google.com/pricing)** (reads/writes/deletes per day). A household shopping list typically stays far below limits if you avoid tight polling.
- Some features (e.g. certain Phone Auth volumes, Cloud Functions in some setups) expect **Blaze**; for **basic Firestore + Email/Password**, Spark is often enough to start.
- In Firebase Console: **gear (Project settings)** → **Usage and billing** to see plan and usage.

---

## Part 10 — Quick checklist

| Step | Where in console |
|------|-------------------|
| Google sign-in | [console.firebase.google.com](https://console.firebase.google.com) |
| New project | Project overview → Add project |
| Web app + `firebaseConfig` | Project overview → `</>` Web app |
| Enable Email/Password | Authentication → Sign-in method |
| Create user | Authentication → Users → Add user |
| Create Firestore | Firestore Database → Create database |
| Edit rules | Firestore Database → Rules → Publish |
| View documents | Firestore Database → **Data** tab |

---

## Next step (app code)

After this setup, the implementation work in the repo is: add the `firebase` package, initialize with `firebaseConfig`, sign in with **Email/Password**, then `getDoc` / `setDoc` or `onSnapshot` on `order_lists/{uid}`. That is separate from this console guide; you can ask to wire it into `OrderListContext` when ready.

---

## Security reminders

- Never commit real `firebaseConfig` or service account JSON to a **public** Git repository. Use **Expo `app.config` extra env**, **`.env`** (gitignored), or EAS Secrets.
- Tighten rules before distributing the app beyond your family.
- Shared password between two people is a **family convenience**, not high security—acceptable for a shopping list if you accept that risk.
