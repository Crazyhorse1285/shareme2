# ShareMe

Personal information sharing — landing page, create account, and dashboard.

## Running locally (test before pushing to Render)

1. **Install dependencies** (once):
   ```powershell
   npm install
   ```

2. **Start the server**:
   ```powershell
   npm start
   ```
   Or: `node server.js`

3. **Open in your browser**:
   - http://localhost:3000/
   - Or: http://localhost:3000/sharemelandingpage.html

If port 3000 is in use, the server will try 3001, 3002, etc. You can also set a port:
   ```powershell
   $env:PORT=3001; node server.js
   ```

4. **Stop the server**: Press `Ctrl+C` in the terminal.

## Move this project out of the Unity folder (optional)

This folder was created as a **standalone** copy of ShareMe with no Unity files. To use it as its own project:

1. **Move the folder**  
   In File Explorer, cut the entire **ShareMe-Standalone** folder and paste it where you want (e.g. `C:\Users\crazy\Documents\ShareMe` or your Desktop). You can rename it to **ShareMe** if you like.

2. **Open in Cursor**  
   In Cursor: **File → Open Folder** and select the moved folder. Your workspace will be only ShareMe (no Unity).

3. **Push to GitHub**  
   In the terminal (with the ShareMe folder as your workspace), run:

   ```powershell
   git init
   git remote add origin https://github.com/Crazyhorse1285/shareme2.git
   git add .
   git commit -m "Initial commit: ShareMe landing, create user, dashboard"
   git branch -M main
   git push -u origin main
   ```

## Files

- **sharemelandingpage.html** — Landing page
- **createuser.html** — Sign-up / create account
- **sharemedashboard.html** — Dashboard (profile selection)
- **styles.css** — Shared styles

Open any `.html` file in a browser to view.
