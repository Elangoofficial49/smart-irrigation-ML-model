# Smart Irrigation System for Precision Farming (Java + ML)

A full-stack mini project: a Java backend (embedded SQLite database + a
self-contained Machine Learning model) and an HTML/CSS/JS frontend with
signup/login, a dashboard, sensor monitoring, irrigation control, crop
management, and weather.

---

## 1. What's inside

```
smart-irrigation-system/
└── backend-java/
    ├── pom.xml                     Maven build file (one dependency: sqlite-jdbc)
    ├── src/main/java/com/smartirrigation/
    │   ├── App.java                 Main entry point - starts the server
    │   ├── Database.java             Embedded SQLite setup + password hashing
    │   ├── SessionManager.java       Simple in-memory login sessions/tokens
    │   ├── model/
    │   │   └── IrrigationModel.java  ML model (logistic regression, trained at startup)
    │   ├── handlers/                 One class per feature (API endpoints)
    │   │   ├── AuthHandler.java      signup / login / logout
    │   │   ├── SensorHandler.java    sensor readings (simulate / latest / history)
    │   │   ├── IrrigationHandler.java ML prediction + manual control
    │   │   ├── CropHandler.java      crop records (add / list / delete)
    │   │   ├── WeatherHandler.java   live weather via Open-Meteo (free, no API key)
    │   │   ├── StaticFileHandler.java serves the frontend files
    │   │   └── BaseHandler.java      shared helpers (JSON responses, auth check)
    │   └── util/Json.java            tiny JSON build/parse helper (no external library)
    └── public/                      the frontend (open these pages in a browser)
        ├── login.html
        ├── signup.html
        ├── dashboard.html
        ├── sensors.html
        ├── irrigation.html
        ├── crops.html
        ├── weather.html
        ├── css/style.css
        └── js/common.js
```

The backend serves **both** the REST API and the frontend files, so once it's
running you only need one URL: `http://localhost:5000/`.

---

## 2. How the ML model works

`IrrigationModel.java` is a **logistic regression classifier written from
scratch in plain Java** (no scikit-learn/Weka — this is intentional, so the
whole project has zero external ML library dependency).

- At server startup, it generates 3,000 synthetic-but-realistic training
  samples of `(soil moisture, temperature, humidity, rainfall probability)`
  and trains itself using batch gradient descent.
- The label rule mimics real agronomy heuristics: low soil moisture pushes
  toward "irrigate", high rainfall probability pushes toward "don't irrigate",
  high temperature / low humidity (faster evapotranspiration) nudges toward
  irrigating sooner.
- `/api/irrigation/predict` takes the **latest real sensor reading** from the
  database and asks the trained model whether to turn irrigation ON or OFF,
  along with a confidence score. Every prediction is logged to the
  `irrigation_logs` table.

---

## 3. Prerequisites

Install these once:

1. **Java Development Kit (JDK) 17 or newer**
   Check with: `java -version`
   Download: https://adoptium.net (Temurin is a good free option)

2. **Maven** (builds the project and downloads the one dependency it needs)
   Check with: `mvn -version`
   Download: https://maven.apache.org/download.cgi

3. **VS Code** with these extensions:
   - "Extension Pack for Java" (by Microsoft) — gives you Java IntelliSense, debugging, and a Run button
   - (Maven support is bundled inside the Java Extension Pack)

You need an internet connection the first time you build (Maven downloads
`sqlite-jdbc`), and whenever you use the Weather page (it calls the free
Open-Meteo API).

---

## 4. Step-by-step setup in VS Code

1. **Download and unzip** the project, then open the `backend-java` folder
   in VS Code (`File > Open Folder...` → select `backend-java`).

2. VS Code will detect the Maven project automatically (you'll see a
   notification / the Java extension indexing the project). Wait for it to
   finish — this also downloads the `sqlite-jdbc` dependency.

3. **Run the app** — either:
   - Open `src/main/java/com/smartirrigation/App.java` and click the
     **Run** button that appears above the `main` method, **or**
   - Open a terminal in VS Code (`Terminal > New Terminal`) and run:
     ```
     mvn compile exec:java -Dexec.mainClass="com.smartirrigation.App"
     ```
   - Or build a single runnable jar and run that:
     ```
     mvn package
     java -jar target/smart-irrigation-backend.jar
     ```

4. You should see in the terminal:
   ```
   [Database] SQLite initialized at database/smart_irrigation.db
   [IrrigationModel] Logistic regression trained on 3000 synthetic samples.
   =================================================
    Smart Irrigation System backend running
    Open: http://localhost:5000/
   =================================================
   ```

5. **Open your browser** to **http://localhost:5000/** — this loads the
   login page.

6. Click **Sign up**, create an account, then log in. You'll land on the
   **Dashboard**.

---

## 5. Using the app

| Page | What it does |
|---|---|
| **Sign Up / Login** | Create an account and log in (passwords are salted + SHA-256 hashed, sessions use a bearer token) |
| **Dashboard** | Overview cards for the latest sensor reading, irrigation status, recent activity, and your crops |
| **Sensor Monitoring** | Click "Simulate New Reading" to generate a new soil moisture / temperature / humidity / rainfall reading (stands in for real hardware sensors) and view reading history |
| **Irrigation Control** | Click "Run ML Prediction" to let the trained model decide ON/OFF from the latest sensor reading, or use the manual ON/OFF buttons; full history is logged below |
| **Crops** | Add/delete crop records (name, area in acres, planting date, notes) |
| **Weather** | Type a city name and fetch live temperature, humidity, rainfall probability, and wind speed from Open-Meteo (needs internet; no API key required) |

---

## 6. Database

The database is a single file created automatically the first time you run
the app: `backend-java/database/smart_irrigation.db` (SQLite). Nothing to
install or configure — it's fully embedded in the Java process.

Tables: `users`, `sensors`, `crops`, `irrigation_logs`.

To reset all data, stop the app and delete the `database/` folder — it will
be recreated empty on the next run.

---

## 7. Troubleshooting

- **"Port 5000 already in use"** — another program is using port 5000, or a
  previous run of the app is still active. Stop it, or change `PORT` at the
  top of `App.java`.
- **Weather page shows an error** — check your internet connection; the
  Weather page calls `open-meteo.com` and `geocoding-api.open-meteo.com`
  directly, so if your network blocks those domains it will fail.
- **Maven can't download sqlite-jdbc** — you need an internet connection the
  first time you build; after that Maven caches it locally (`~/.m2`).
- **"401 Not authenticated" errors in the browser console** — your session
  token expired or the server restarted (tokens are in-memory and reset on
  restart). Just log in again.

---

## 8. Notes for your project report

- **Backend**: Java (plain JDK `HttpServer`, no external web framework),
  embedded SQLite database via JDBC, REST-style JSON API.
- **Machine Learning**: logistic regression implemented from scratch in
  Java, trained via batch gradient descent on synthetic agronomic data,
  used for real-time irrigation ON/OFF decisions with confidence scoring.
- **Frontend**: HTML5, CSS3, vanilla JavaScript (fetch API), no frameworks.
- **Auth**: SHA-256 password hashing with per-user random salt, bearer-token
  sessions.
- **External integration**: Open-Meteo REST API for live weather (free,
  keyless).
