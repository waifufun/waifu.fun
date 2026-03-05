# waifufun

Getting Started – the waifu.fun Monorepo
This guide helps you set up and run the waifu.fun monorepo locally.

1. Install Dependencies (we use pnpm for package management):
`pnpm i`

2. Start the Development Environment
`pnpm run dev`

This will automatically configure and start the Docker containers.


Optional: Using sharp on Linux x64 flavors:
```sudo apt-get update && sudo apt-get install -y libvips-dev build-essential pkg-config libjpeg-dev libpng-dev libtiff-dev libwebp-dev```


MacOS Users – Mongoose / Docker Connection Fix:
If you're on MacOS and get a ECONNREFUSED error when connecting to MongoDB (via Mongoose), do the following:

- Enable Host Networking in Docker:
1: Open Docker Desktop
2: Go to ```Settings > Resources > Network```
3: Enable ```Allow host networking```
4: Restart Docker

- Add a host alias to prevent mongoose replica error:
1: open your teminal
2: Edit the hosts file by running ```sudo nano /etc/hosts```
3: Add the following line ```127.0.0.1 host.docker.internal```
4: Exit, and reboot

-add NEXT_PUBLIC_HOST

docker build -t waifufun-frontend -f apps/frontend/Dockerfile.frontend .
