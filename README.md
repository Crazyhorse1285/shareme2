# ShareMe

Personal information sharing — landing page, create account, and dashboard.

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
