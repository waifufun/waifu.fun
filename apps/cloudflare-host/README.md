# Cloudflare service hosting

Hosts the seven existing backend images in separate Cloudflare Containers.
Use an immutable digest from the running deployment when preparing a migration.
Supply the owning Cloudflare account when deploying; no account is assumed here.

Install `RUNTIME_CONFIG` as a JSON secret containing the service's existing
string-valued runtime settings, including `SERVICE_NAME`. Preserve financial
flags, credentials, database selection, queue names, and processing cursors.
State endpoints must be reachable from Cloudflare. PostgreSQL and Redis remain
external; this host alone does not retire Redis or migrate queued work.

Deployments start inactive. Verify the image and configuration, then stop and
drain the old process before setting `SERVICE_ENABLED=true`. Background services
are kept running by cron without requiring an HTTP listener. Only the API accepts
public requests. A successful start is not proof of job or transaction completion.

To deactivate, set `SERVICE_ENABLED=false`. HTTP requests and cron send SIGTERM.
Observe the stopped container and reconcile in-flight work before transferring
ownership. Never run both copies of financial workers at the same time.
