# Local Install for Designers

Each designer should run their own local copy. This means each person gets a private tracker on their own computer, saved only in their local `data/tracker.json` file.

## No-Install Setup

1. Download or receive `DTP-Web-Tracker-No-Install.zip`.

2. Unzip it somewhere easy, for example:

```text
Documents\DTP Web Tracker
```

3. Double-click:

```text
Start DTP Tracker.cmd
```

4. The tracker opens here:

```text
http://localhost:4173
```

Keep the black command window open while using the tracker. Closing it stops the local tracker.

The no-install package includes `runtime\node.exe`, so designers do not need to install Node.js.

## Privacy

This local version is not shared. Rows added by one designer stay on that designer's computer.

## Backup

Back up this file if you want to keep the tracker history:

```text
data\tracker.json
```

## Send to Another Designer

Send the app folder without your own `data\tracker.json`. If that file is included, they will receive a copy of your rows.
