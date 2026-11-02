import os

os.environ.setdefault("DEMO_MODE", "true")

from fastapi.testclient import TestClient
from backend.app.main import app


def test_dashboard_and_project_workflow():
    with TestClient(app) as client:
        dashboard = client.get("/api/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["demo"] is True
        assert len(dashboard.json()["project"]) >= 6

        client.post("/api/repositories/discover").raise_for_status()
        managed = client.patch(
            "/api/repositories/state",
            json={"id": "sample/new-project", "state": "managed"},
        )
        assert managed.json()["state"] == "managed"

        project = client.post(
            "/api/projects",
            json={
                "name": "API test project",
                "repositories": ["sample/new-project"],
                "provider": "GitHub Actions",
                "branch": "main",
            },
        )
        project.raise_for_status()
        assert project.json()["environments"] == [
            "development",
            "preview",
            "staging",
            "production",
        ]


def test_security_gate_and_rollback_validation():
    with TestClient(app) as client:
        blocked = client.post(
            "/api/projects/journeyalert/deployments",
            json={"action": "deploy", "environment": "production"},
        )
        assert blocked.status_code == 409
        assert "Security gate" in blocked.json()["detail"]

        invalid = client.post(
            "/api/projects/mediaverse/deployments",
            json={
                "action": "rollback",
                "environment": "production",
                "target": "deploy-3-0",
            },
        )
        assert invalid.status_code == 400


def test_sample_health_and_secret_boundary():
    with TestClient(app) as client:
        check = client.post("/api/health/checks/check-0-0/run")
        check.raise_for_status()
        assert check.json()["sample"] is True

        secret = client.post(
            "/api/projects/mediaverse/secrets",
            json={"name": "DATABASE_URL", "value": "never-store-plaintext"},
        )
        assert secret.status_code == 503
        assert "MASTER_ENCRYPTION_KEY" in secret.json()["detail"]


def test_workflow_editor_uses_managed_repository_and_supports_pull_requests():
    with TestClient(app) as client:
        params = {"repo": "aayvu/aayvu"}
        listed = client.get("/api/projects/aayvu-web/workflows", params=params)
        listed.raise_for_status()
        assert listed.json()["workflows"]

        content = client.get(
            "/api/projects/aayvu-web/workflows/content",
            params={**params, "path": ".github/workflows/ci.yml"},
        )
        content.raise_for_status()
        assert "workflow_dispatch" in content.json()["content"]

        updated = client.patch(
            "/api/projects/aayvu-web/workflows",
            json={
                "repo": "aayvu/aayvu",
                "path": ".github/workflows/control-plane.yml",
                "content": "name: Control plane\non: workflow_dispatch\n",
                "mode": "pull_request",
            },
        )
        updated.raise_for_status()
        assert updated.json()["mode"] == "pull_request"
        assert updated.json()["sample"] is True
        assert "html_url" not in updated.json()

        invalid_direct = client.patch(
            "/api/projects/aayvu-web/workflows",
            json={
                "repo": "aayvu/aayvu",
                "path": ".github/workflows/control-plane.yml",
                "content": "name: Control plane\n",
                "mode": "direct",
            },
        )
        assert invalid_direct.status_code == 400

        direct = client.patch(
            "/api/projects/aayvu-web/workflows",
            json={
                "repo": "aayvu/aayvu",
                "path": ".github/workflows/control-plane.yml",
                "content": "name: Control plane\n",
                "mode": "direct",
                "branch": "feature/control-plane",
            },
        )
        direct.raise_for_status()
        assert direct.json()["branch"] == "feature/control-plane"

        unmanaged = client.get(
            "/api/projects/aayvu-web/workflows",
            params={"repo": "sample/unreviewed"},
        )
        assert unmanaged.status_code == 400


def test_control_plane_runs_patterns_accounts_and_runner_boundaries():
    with TestClient(app) as client:
        runs = client.get("/api/actions/runs")
        runs.raise_for_status()
        assert runs.json()["repositories_scanned"] > 0
        assert runs.json()["workflow_runs"]
        assert all(run["sample"] for run in runs.json()["workflow_runs"])

        pattern = client.post(
            "/api/organization-patterns",
            json={
                "organization": "sample",
                "name": "Shared CI",
                "path": ".github/workflows/shared.yml",
                "content": "name: Shared CI\non: workflow_dispatch\n",
            },
        )
        pattern.raise_for_status()
        applied = client.post(
            f"/api/organization-patterns/{pattern.json()['id']}/apply"
        )
        applied.raise_for_status()
        assert applied.json()["sample"] is True
        assert applied.json()["results"]
        assert {item["status"] for item in applied.json()["results"]} == {"simulated"}

        account = client.post(
            "/api/integrations/accounts",
            json={
                "provider": "Cloudflare Pages",
                "name": "Sample Cloudflare",
                "account_id": "a" * 32,
                "project_name": "sample-pages",
            },
        )
        account.raise_for_status()
        from backend.app.main import provider_project

        resolved = provider_project(
            {
                "id": "test-project",
                "provider": "Cloudflare Pages",
                "provider_config": {
                    "integration_account_id": account.json()["id"]
                },
                "repositories": [],
            }
        )
        assert resolved["provider_config"]["account_id"] == "a" * 32
        assert resolved["provider_config"]["project_name"] == "sample-pages"
        client.delete(f"/api/integrations/accounts/{account.json()['id']}").raise_for_status()

        runner = client.post(
            "/api/runners/install-command",
            json={"repo": "aayvu/aayvu", "name": "local-runner"},
        )
        assert runner.status_code == 409
        assert "Sample mode" in runner.json()["detail"]
