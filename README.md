# Harappa News

A lightweight news website with a public story feed and a password-protected newsroom. Editors can publish stories with text, photos, and videos; readers can browse sections and watch videos directly on the site.

## Run locally

Requires Node.js 18 or newer. No packages to install.

```sh
NEWS_ADMIN_PASSWORD='choose-a-strong-password' node server.js
```

Open [http://localhost:3000](http://localhost:3000) for the public site or [http://localhost:3000/admin](http://localhost:3000/admin) to sign in. The default editor username is `admin`; set `NEWS_ADMIN_USER` to change it and `PORT` to use another port.

The site writes published stories and uploaded media to `.data/`, which is excluded from Git. On startup and once every 24 hours, it also creates a full backup under `.backups/` and keeps the seven newest snapshots. Set `NEWS_BACKUP_RETENTION` to a number from 1 to 365 to change how many snapshots are kept. Both directories are excluded from Git.

For lasting storage on a hosted server, attach persistent storage and point the app at it:

```sh
NEWS_DATA_DIR=/mnt/harappa-data \
NEWS_BACKUP_DIR=/mnt/harappa-backups \
NEWS_BACKUP_RETENTION=14 \
NEWS_ADMIN_PASSWORD='choose-a-strong-password' \
node server.js
```

Mount `/mnt/harappa-data` and `/mnt/harappa-backups` as persistent volumes in your hosting provider. Whenever possible, keep backups on a separate disk or storage service from the live data. The local `.backups/` folder helps recover from accidental changes, but a backup on the same temporary disk will not survive disk loss or host cleanup. Restore a snapshot by stopping the server and copying its `news.json` and `uploads/` into the configured data directory. Accepted uploads are JPG, PNG, GIF, or WebP photos (up to 15 MB), and MP4 or WebM videos (up to 90 MB).

## Share with readers

For readers on other devices to access the site, run it on a publicly reachable host that supports Node.js and persistent storage, and point your channel's domain at that host. Set `NEWS_ADMIN_PASSWORD` and `NODE_ENV=production` in the host's environment; production sessions use secure cookies and require HTTPS. Configure both persistent data and backup volumes before publishing stories.
