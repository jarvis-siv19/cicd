# CICD

A private engineering control plane for projects, deployments, security, health, infrastructure, logs, and audit activity. The repository includes a responsive React dashboard, a FastAPI API, a Redis-backed worker, PostgreSQL persistence, and an outbound-only Go host agent.

## Explore locally

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
./run.sh
```

Open `http://127.0.0.1:5173`. Sample mode is enabled by default and labels every simulated provider action. The local fallback database is SQLite; production uses PostgreSQL through `DATABASE_URL`.

The overview starts with recent GitHub Actions runs across managed repositories. The footer follows the signature and profile links used on [music.siv19.dev](https://music.siv19.dev): “Build • Automate • Open Source,” `siv19.dev`, GitHub, LinkedIn, and Instagram.

Vercel can deploy the Vite dashboard and the FastAPI function from this repository. Set the Vercel project Root Directory to the repository root (the directory containing `package.json` and `vercel.json`) and provide `DATABASE_URL` (PostgreSQL) plus the production environment variables below for durable, live data. Without `DATABASE_URL`, Vercel uses an in-memory demo database because its function filesystem is ephemeral.

## Production configuration

Copy `.env.example` to `.env`, set `DEMO_MODE=false`, generate `SESSION_SECRET`, and generate a Fernet key for `MASTER_ENCRYPTION_KEY`. Set `APP_URL` to the exact public HTTPS origin. Never commit `.env` or the GitHub App private key.

Create two GitHub integrations:

1. A GitHub OAuth app for login. Set its callback URL to `https://cicd.siv19.dev/api/auth/callback` and list authorized accounts with roles in `GITHUB_ALLOWED_USERS`.
2. A GitHub App for repository discovery and Actions. Give it read access to metadata, contents, Actions, checks, and pull requests. Workflow editing needs Contents read/write and Pull requests read/write; the default UI path creates a pull request, while direct updates are limited to a chosen branch. Actions write access is needed for dispatch, rerun, and cancel controls. Repository-scoped self-hosted runner registration also requires Administration write permission. Set its webhook URL to `https://cicd.siv19.dev/api/webhooks/github`, subscribe to workflow-run and installation/repository events, and mount the private key at `GITHUB_APP_PRIVATE_KEY_PATH`.

Use **Integrations** to save multiple deployment accounts per provider, then select an account in each project's settings. Cloudflare and Vercel API credentials are verified on connection and encrypted using `MASTER_ENCRYPTION_KEY`; they are not returned by the API. Cloudflare Pages uses a Git-connected Pages project. GitHub Pages and Zoho Catalyst are dispatched through repository workflows, so their provider credentials must be stored as protected GitHub Actions environment or repository secrets (never as `workflow_dispatch` inputs). Configure project-specific workflow filenames and identifiers under project settings:

- Vercel: `project_id`, numeric GitHub `repo_id`, and optional `team_id`. Set `VERCEL_TOKEN` on the API and worker.
- GitHub Actions: `installation_id` and a dispatchable workflow filename.
- GitHub Pages: a dispatchable workflow filename that configures Pages build and deploy.
- Cloudflare Pages: connect the account and Pages project; the project must be Git-connected for branch deployments.
- Zoho Catalyst: a dispatchable workflow filename that installs/authenticates the Catalyst CLI using protected GitHub Actions secrets.
- Docker Compose: registered `agent_id` and an allowlisted service name.

Use **Projects → Repository discovery** to filter repositories by owner/organization and mark each as managed, ignored, or unreviewed. **Pipelines** lists GitHub Actions workflow files and recent runs for a selected managed project repository, and lets an administrator review the YAML before publishing it. New starter workflows include an environment-based review gate and security scanner jobs; deployment remains disabled until a provider-specific action is configured. Pull requests are the recommended/default publish mode; direct branch updates require explicitly selecting the target branch. **Org patterns** stores a shared workflow and proposes it through pull requests to managed repositories in the selected organization. Sample mode simulates workflow changes and does not contact GitHub.

**Runners** can list repository runners and request a short-lived GitHub registration token, returned as a Docker command for a persistent, repo-scoped runner using named volumes. The image is the community-maintained `ghcr.io/myoung34/github-runner`, not an official GitHub image. Treat the generated command as a secret until the token expires. Self-hosted runners execute repository workflows on the host: use trusted repositories, protect workflow files and branches, and do not expose a persistent runner to untrusted pull requests. Removing the container alone does not remove its named volumes; remove the runner and volumes on the host when decommissioning it.

The agent only makes outbound HTTPS requests and only executes fixed Docker Compose operations for services in its local allowlist. Register a host through `POST /api/agents/register`, store the one-time token in `agent.json`, and map logical service names to absolute Compose file paths. It does not expose SSH or a general shell.

Run the full stack behind an HTTPS reverse proxy:

```bash
docker compose up --build -d
```

Run exactly one `scheduler` replica. Worker replicas may scale horizontally. Configure backups for the PostgreSQL volume before connecting production systems.

## Security pipeline and scanner imports

`.github/workflows/devsecops.yml` contains the requested V1 scanners: Semgrep, Gitleaks, Trivy, OSV-Scanner, and Syft/CycloneDX generation. Upload their JSON output to `POST /api/security/import` from a trusted CI job. Critical vulnerabilities and detected secrets block deployment by default; project settings can override those gates. Raw secret values from Gitleaks are never retained.

## Verification

```bash
npm run build
DATABASE_URL=sqlite:////private/tmp/cicd-test.db .venv/bin/pytest -q
GOCACHE=/private/tmp/cicd-go-cache go test ./agent/...
```

The browser smoke path covers desktop and mobile rendering, navigation, repository triage, project creation, and a sample deployment action.
