# Library Management System

A local library app for managing books, members, and book issue/return transactions. Data is stored in `data\library.db` using SQLite.

## Requirements

- Windows
- Node.js 22.5 or newer (the app uses Node's built-in SQLite module; no npm packages are needed)

## Run

Double-click `run.bat`, or run `npm start` from this folder. Then open [http://localhost:3000](http://localhost:3000) in your browser. Stop the server with `Ctrl+C`.

Set a different port before launching if port 3000 is already in use:

```bat
set PORT=3001
run.bat
```

## Jenkins

The root `Jenkinsfile` runs on a Jenkins agent labeled `windows` with Node.js 22.5 or newer available on `PATH`. It checks the Node.js version and validates the server, database, and browser JavaScript syntax. The project has no npm dependencies to install.

## Features

- Add, search, edit, and remove books and members
- Track total and available book copies
- Issue available copies to members with a due date
- Record returns and retain loan history
- View active and overdue loans on the dashboard

Books and members with loan history cannot be deleted, preserving transaction records.
