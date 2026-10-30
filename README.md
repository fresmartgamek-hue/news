# Harappa News

A lightweight news website with a public story feed and a password-protected newsroom. Editors can publish stories with text, photos, and videos; readers can browse sections and watch videos directly on the site.

## Run locally

Requires Node.js 18 or newer. No packages to install.

```sh
NEWS_ADMIN_PASSWORD='choose-a-strong-password' node server.js
```

Open [http://localhost:3000](http://localhost:3000) for the public site or [http://localhost:3000/admin](http://localhost:3000/admin) to sign in. The default editor username is `admin`; set `NEWS_ADMIN_USER` to change it and `PORT` to use another port.

The site writes published stories and uploaded media to `.data/`, which is excluded from Git. Back up this directory to preserve your posts. Accepted uploads are JPG, PNG, GIF, or WebP photos (up to 15 MB), and MP4 or WebM videos (up to 90 MB).

## Share with readers

For readers on other devices to access the site, run it on a publicly reachable host that supports Node.js and persistent local storage, and point your channel's domain at that host. Set `NEWS_ADMIN_PASSWORD` and `NODE_ENV=production` in the host's environment; production sessions use secure cookies and require HTTPS. Keep `.data/` on persistent storage, since ephemeral hosting filesystems will lose stories and uploads when restarted.
