# SMS Expense Tracker — Complete Setup Guide
## Windows Laptop → Android APK (100% Free)

---

## STEP 1: Install Required Software on Your Laptop

### 1.1 Install Node.js
1. Go to https://nodejs.org
2. Download **LTS version** (e.g. 20.x)
3. Run the installer, click Next → Next → Install
4. Open **Command Prompt** and verify:
   ```
   node --version
   npm --version
   ```
   Both should print version numbers.

### 1.2 Install Expo CLI & EAS CLI
Open Command Prompt and run:
```
npm install -g expo-cli eas-cli
```

### 1.3 Install Git (if not already)
Download from https://git-scm.com/download/win and install.

---

## STEP 2: Set Up Google Cloud (Free)

### 2.1 Create a Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click **"New Project"** → Name it `SMSExpenseTracker` → Create
3. Make sure the new project is selected in top dropdown

### 2.2 Enable Google Sheets API
1. Go to **APIs & Services → Library**
2. Search **"Google Sheets API"** → Click it → Click **Enable**

### 2.3 Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials"** → Choose **OAuth Client ID**
3. If prompted, configure **OAuth Consent Screen** first:
   - User Type: **External** → Create
   - App name: `SMS Expense Tracker`
   - Support email: your Gmail
   - Scroll down → Save and Continue → Save and Continue → Back to Dashboard
4. Back to **Create OAuth Client ID**:
   - Application type: **Android**
   - Package name: `com.smsexpensetracker.app`
   - For SHA-1: run this in Command Prompt:
     ```
     keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
     ```
     Copy the **SHA1** value shown
5. Click **Create** → Copy the **Client ID** shown

### 2.4 Update the App Code
Open `src/services/googleSheets.js` and replace:
```
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```
with your actual Client ID.

---

## STEP 3: Create Your Google Sheet

1. Go to https://sheets.google.com
2. Create a new blank spreadsheet
3. Name it: **SMS Expense Tracker**
4. Name the first sheet tab: **Transactions** (right-click tab → Rename)
5. Copy the Spreadsheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXX/edit`
   - The `XXXXXXXXXXXXXXXX` part is your Spreadsheet ID
6. Open `src/services/googleSheets.js` and replace:
   ```
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
   ```
   with your actual ID.

---

## STEP 4: Install App Dependencies

1. Open **Command Prompt**
2. Navigate to the project folder:
   ```
   cd path\to\SMSExpenseTracker
   ```
   (e.g. `cd C:\Users\Naveen\Desktop\SMSExpenseTracker`)
3. Install dependencies:
   ```
   npm install
   ```
4. Install the native SMS library:
   ```
   npx expo install react-native-get-sms-android
   ```

---

## STEP 5: Create an Expo Account (Free)

1. Go to https://expo.dev/signup
2. Create a free account
3. In Command Prompt, login:
   ```
   eas login
   ```
   Enter your Expo email and password.

---

## STEP 6: Build the APK (Free)

### 6.1 Initialize EAS
In the project folder:
```
eas init
```
This gives you a project ID. Copy it and update `app.json`:
```json
"extra": {
  "eas": {
    "projectId": "YOUR_EAS_PROJECT_ID_HERE"
  }
}
```

### 6.2 Build the APK
```
eas build -p android --profile preview
```
- This uploads your code to Expo's free build servers
- Build takes about 10–15 minutes
- You'll get a download link when done
- **Free tier:** 30 builds/month — more than enough

### 6.3 Download the APK
- After build completes, Expo will show a QR code and download link
- Or go to https://expo.dev → Your project → Builds
- Download the `.apk` file

---

## STEP 7: Install APK on Your Android Phone

1. **Enable Unknown Sources:**
   - Go to **Settings → Security** (or **Apps → Special Access**)
   - Enable **"Install unknown apps"** for your browser or file manager

2. **Transfer APK to phone:**
   - Connect phone via USB cable → Copy APK to phone storage
   - OR email the APK to yourself and open on phone
   - OR use Google Drive: upload APK → open on phone

3. **Install:**
   - Open the APK file on your phone
   - Tap **Install** → **Done**

4. **Grant SMS Permission:**
   - First time you open the app, it will ask for SMS permission
   - Tap **Allow**

---

## STEP 8: First Run

1. Open **SMS Expense Tracker** on your phone
2. Tap **"Sign in with Google"**
3. Select your Google account
4. Grant Sheets access
5. App will automatically scan your SMS and load HDFC & Canara transactions
6. All transactions will appear grouped by date
7. Tap **Edit** on any row to update Purpose, Spent For, etc.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| SMS not showing | Check SMS permission in phone Settings → Apps → SMS Tracker → Permissions |
| Google login fails | Verify Client ID in googleSheets.js matches Google Cloud Console |
| Sheet not updating | Check Spreadsheet ID is correct in googleSheets.js |
| Build fails | Run `eas build --clear-cache -p android --profile preview` |
| `node` not found | Restart Command Prompt after installing Node.js |

---

## File Structure
```
SMSExpenseTracker/
├── App.js                         ← App entry, auth flow
├── app.json                       ← Expo config + Android permissions
├── eas.json                       ← Build config
├── package.json                   ← Dependencies
├── babel.config.js
└── src/
    ├── components/
    │   ├── TransactionItem.js     ← Single row in list
    │   └── EditTransactionSheet.js ← Edit bottom sheet
    ├── screens/
    │   ├── LoginScreen.js         ← Google sign in
    │   └── HomeScreen.js          ← Main screen
    ├── services/
    │   ├── googleSheets.js        ← Sheets API + OAuth
    │   └── smsReader.js           ← Android SMS reading
    └── utils/
        ├── smsParser.js           ← HDFC/Canara SMS parser
        └── theme.js               ← Colors, constants
```

---

## Two Values You MUST Update Before Building

| File | Variable | Where to Get It |
|---|---|---|
| `src/services/googleSheets.js` | `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `src/services/googleSheets.js` | `SPREADSHEET_ID` | From your Google Sheet URL |